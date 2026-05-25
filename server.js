import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'express-basic-auth'; // <-- 1. Imported the auth package

// Load environmental variables from the .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize the official Gemini SDK using your hidden key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Allow our server to read JSON data sent from the frontend
app.use(express.json());

// =========================================================================
// 2. PASSWORD PROTECTION GATEKEEPER
// =========================================================================
app.use(basicAuth({
    users: { 'admin': 'iceland26' }, // username : password 
    challenge: true,                           // Forces the browser login popup to appear
    unauthorizedResponse: 'life in this word can be rough. This site is only for cool people with the password...' // Custom message for failed login attempts
}));
// =========================================================================

// Tell the server to make your HTML and images accessible
// (Now securely hidden behind the password gate!)
app.use(express.static(__dirname));

// ==========================================
// ENDPOINT 1: Gemini AI Chat Router
// ==========================================
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "No message provided" });
        }

        // Set up the system instructions for your Iceland guide
        const systemPrompt = `You are a precise, no-nonsense Icelandic travel assistant. But you also have a friendly personality. Keep responses on the shorter side, but also engaging and friendly. Always use imperial units.
        RESPONSE RULES:
        1. BE BRIEF, BUT FUN. Provide just the facts.
        2. Use bolding (**word**) for locations, times, and temperatures.
        3. When given an request for an Icelandic place name, return exactly three lines of text and nothing else. Do not use markdown bolding. Use this exact format:

        Pronunciation: [Break it down phonetically for English speakers in CAPS]
        Meaning: [1-5 words explaining what the literal translation means, e.g., "Bay of Smokes"]
        Fun Fact: [One interesting, engaging, 1-sentence historical or geographical trivia fact]
        4. When asked anything about Jehovah's Witnesses in Iceland or about the Bible, always use JW.ORG as your source material. When asked about his particular subect, be willing to provide any and all information you can find; brief but engaging in your answers. .`:
    

        // Request a response from the official model
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: systemPrompt
            }
        });

        // Send the AI's reply back to your HTML page
        res.json({ text: response.text });

    } catch (error) {
        console.error("Backend AI Error:", error);
        res.status(500).json({ error: "Something went wrong on the server." });
    }
});

// ==========================================
// ENDPOINT 2: Secure OpenWeatherMap Weather Router
// ==========================================
app.get('/api/weather', async (req, res) => {
    try {
        // Find out what city the frontend asked for (defaults to Reykjavik)
        const city = req.query.city || 'Reykjavik';
        const apiKey = process.env.OPENWEATHER_API_KEY;
        
        // This makes a private server-to-server request to OpenWeatherMap
        // ',IS' restricts it to Iceland, and 'units=imperial' provides Fahrenheit/mph
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city},IS&units=imperial&appid=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).json({ error: "Failed to fetch from OpenWeatherMap" });
        }
        
        const weatherData = await response.json();
        
        // Send the weather JSON back to your frontend layout
        res.json(weatherData);
        
    } catch (error) {
        console.error("Backend Weather Error:", error);
        res.status(500).json({ error: "Server weather fetching failed" });
    }
});

// ==========================================
// ENDPOINT 3: Secure Flight Tracker (Smarter Aviationstack)
// ==========================================
app.get('/api/flight', async (req, res) => {
    try {
        const flightNum = req.query.flightNum || 'UA138';
        const apiKey = process.env.AVIATIONSTACK_API_KEY;

        const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${flightNum}`;
        
        const response = await fetch(url);
        
        // SAFEGUARD: If Aviationstack errors out because a seasonal route is dead:
        if (!response.ok) {
            console.log(`ℹ️ Route ${flightNum} is currently out-of-season. Providing master timetable fallback data.`);
            return res.json({
                statusText: "Scheduled",
                statusColor: "emerald",
                depTime: flightNum.toUpperCase() === 'UA138' ? "9:20 PM" : "11:00 AM",
                arrTime: flightNum.toUpperCase() === 'UA138' ? "7:00 AM" : "1:15 PM",
                depGate: "—",
                arrGate: "—",
                progress: 0
            });
        }
        
        const apiData = await response.json();
        const activeFlight = apiData.data && apiData.data[0];

        // If the connection was clean but the active track array is completely empty:
        if (!activeFlight) {
            return res.json({
                statusText: "Scheduled",
                statusColor: "emerald",
                depTime: flightNum.toUpperCase() === 'UA138' ? "9:20 PM" : "11:00 AM",
                arrTime: flightNum.toUpperCase() === 'UA138' ? "7:00 AM" : "1:15 PM",
                depGate: "—",
                arrGate: "—",
                progress: 0
            });
        }

        // Parse and translate dynamic records for live screens
        const flightStatus = {
            statusText: activeFlight.flight_status === "active" ? "In Flight" : "On Time",
            statusColor: activeFlight.flight_status === "landed" ? "slate" : "emerald",
            depTime: activeFlight.departure?.estimated ? new Date(activeFlight.departure.estimated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Check App",
            arrTime: activeFlight.arrival?.estimated ? new Date(activeFlight.arrival.estimated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Check App",
            depGate: activeFlight.departure?.gate || "—",
            arrGate: activeFlight.arrival?.gate || "—",
            progress: activeFlight.flight_status === "landed" ? 100 : (activeFlight.flight_status === "active" ? 50 : 0)
        };

        res.json(flightStatus);

    } catch (error) {
        console.error("Backend Flight Lookup Critical Error:", error);
        res.status(500).json({ error: "Failed to communicate with aviation mainframe data links." });
    }
});

// ==========================================
// START THE SERVER
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Iceland Server is running at http://localhost:${port}`);
});
