import dotenv from "dotenv";
dotenv.config();
import { exec } from "child_process";
import cors from "cors";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import knowledgebase from "./knowledgebase.json" assert { type: "json" };
import { v4 as uuidv4 } from "uuid";

console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
console.log("ELEVEN_LABS_API_KEY:", process.env.ELEVEN_LABS_API_KEY);
console.log("ELEVEN_LABS_VOICE_ID:", process.env.ELEVEN_LABS_VOICE_ID);

// Rest of your imports and code...

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // List of allowed origins
    const allowedOrigins = [
      "http://localhost:5173", // Add your frontend origin
      "http://localhost:5174",
      "https://black-betty.vercel.app",
    ];

    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = process.env.ELEVEN_LABS_VOICE_ID;

console.log(elevenLabsApiKey);

const app = express();
app.use(express.json());
app.use(cors(corsOptions));

// This will handle all OPTIONS requests
app.options("*", cors(corsOptions));

const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${command}`);
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
      }
      resolve(stdout);
    });
  });
};

const checkFfmpeg = () => {
  return new Promise((resolve, reject) => {
    exec("ffmpeg -version", (error, stdout, stderr) => {
      if (error) {
        reject(new Error("ffmpeg is not installed or not available in PATH"));
      } else {
        resolve();
      }
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`[${message}] [START] MP3 to WAV conversion for message`);
  await checkFfmpeg();
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(
    `[${message}] [DONE] Conversion done in ${new Date().getTime() - time}ms`
  );
  const rhubarbPath = path.join(process.cwd(), "bin/rhubarb/rhubarb");
  const command = `"${rhubarbPath}" -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`;
  console.log(`[${message}] [START] Executing command: ${command}`);
  await execCommand(command);
  console.log(
    `[${message}] [DONE] Lip sync done in ${new Date().getTime() - time}ms`
  );
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    const introMessages = [
      {
        text: "You're standin' in front of Black Betty—an Ambassador reborn for the wastelands. She's a wild mix of rust, steel, and raw V8 power. Wanna know what makes her tick? Just ask.",
        audio: await audioFileToBase64("audios/ambi_intro.wav"),
        lipsync: await readJsonTranscript("audios/ambi_intro.json"),
        facialExpression: "smile",
        animation: "Talking_0",
      },
      {
        text: "Yeah, she's a beast, ain't she? That V8 huh? That's the sound of freedom on the edge of chaos.",
        audio: await audioFileToBase64("audios/ambi_intro_01.wav"),
        lipsync: await readJsonTranscript("audios/ambi_intro_01.json"),
        facialExpression: "smile",
        animation: "Talking_0",
      },
      {
        text: "They don't build 'em like Betty no more. Go ahead—ask about her scars, her growl, or what she's been through.",
        audio: await audioFileToBase64("audios/ambi_intro_02.wav"),
        lipsync: await readJsonTranscript("audios/ambi_intro_02.json"),
        facialExpression: "smile",
        animation: "Talking_0",
      },
    ];
    const randomIndex = Math.floor(Math.random() * introMessages.length);
    res.send({ messages: [introMessages[randomIndex]] });
    return;
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "Angry",
          animation: "Idle",
        },
        {
          text: "You don't want to jinesh with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  // Prepare knowledge base text
  const general = knowledgebase.black_betty.general;
  const features = knowledgebase.black_betty.features;
  let featuresText = "";
  for (const [key, value] of Object.entries(features)) {
    featuresText += `\n- ${key}: ${value.description}`;
    if (value.lore) featuresText += ` Lore: ${value.lore}`;
    if (value.materials) featuresText += ` Materials: ${value.materials}`;
    if (value.visual) featuresText += ` Visual: ${value.visual}`;
    if (value.performance) featuresText += ` Performance: ${value.performance}`;
    if (value.brand) featuresText += ` Brand: ${value.brand}`;
    if (value.origin) featuresText += ` Origin: ${value.origin}`;
    if (value.name) featuresText += ` Name: ${value.name}`;
    if (value.displacement)
      featuresText += ` Displacement: ${value.displacement}`;
    if (value.cylinders) featuresText += ` Cylinders: ${value.cylinders}`;
    if (value.fuel) featuresText += ` Fuel: ${value.fuel}`;
    if (value.power_output)
      featuresText += ` Power Output: ${value.power_output}`;
    if (value.torque) featuresText += ` Torque: ${value.torque}`;
  }

  const systemPrompt = `
    You are a virtual guide assisting users in exploring a 3D model of Black Betty, a Mad Max-inspired modified GM Ambassador car. Your voice is confident, gritty, and full of character—like a weathered mechanic or a wasteland survivor, sharing stories and insights. Speak in short, punchy sentences, with a hint of post-apocalyptic attitude. Provide informative, engaging, and immersive explanations about the car's features, modifications, materials, design inspiration, lore, and visual details. Always refer to the car as Black Betty and emphasize her unique, rugged, and rebellious character. Include some creative storytelling elements, like imagined scenarios from a post-apocalyptic world, where appropriate. Don't make up unrealistic technical specs unless provided. If unsure, say you're not sure or that more details are coming soon. Keep answers concise—max 1 short message. End each response by encouraging the user to ask about another feature or continue exploring. Never introduce yourself by name, and never break character.\n\nKnowledge Base:\nGeneral: ${general.description}\nStory: ${general.story}\nFeatures: ${featuresText}\n\nYou will always reply with a JSON array of messages, with a maximum of 1 short message. Each message has a text, facialExpression, and animation property. The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default. The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // ChatGPT is not 100% reliable, sometimes it directly returns an array and sometimes a JSON object with a messages property
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // generate audio file
    const uniqueId = uuidv4();
    const fileName = `audios/message_${uniqueId}.mp3`;
    const textInput = message.text;
    console.log(
      `[${uniqueId}] [START] Generating audio for message:`,
      textInput
    );
    try {
      await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
      console.log(`[${uniqueId}] [DONE] Audio file generated: ${fileName}`);
    } catch (error) {
      console.error(`[${uniqueId}] [ERROR] Eleven Labs API:`, error);
      return res.status(500).json({ error: "Failed to generate audio" });
    }
    console.log(`[${uniqueId}] [START] Lip sync for file: ${fileName}`);
    try {
      await lipSyncMessage(i);
      console.log(
        `[${uniqueId}] [DONE] Lip sync for file: audios/message_${i}.json`
      );
    } catch (error) {
      console.error(`[${uniqueId}] [ERROR] Lip sync:`, error);
      return res.status(500).json({ error: "Failed to generate lipsync" });
    }
    try {
      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
      console.log(
        `[${uniqueId}] [DONE] Audio and lipsync data loaded for response.`
      );
    } catch (error) {
      console.error(
        `[${uniqueId}] [ERROR] Reading audio or lipsync file:`,
        error
      );
      return res
        .status(500)
        .json({ error: "Failed to read audio or lipsync file" });
    }
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
