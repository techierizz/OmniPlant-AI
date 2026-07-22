# 🏭 OmniPlant AI

> **Cognitive Asset Intelligence for Heavy Industry**

OmniPlant AI is a next-generation industrial knowledge graph and reasoning engine. It transforms static, disconnected industrial documents (P&IDs, OEM manuals, SOPs, maintenance logs) into a dynamic, queryable Knowledge Graph.

**🌐 Live Demo:** [https://omni-plant-ai.vercel.app/](https://omni-plant-ai.vercel.app/)

Built for hackathons and rapid prototyping, OmniPlant AI features a visually stunning interface and live Gemini 2.5 Flash extraction capabilities.

![OmniPlant AI Architecture](https://via.placeholder.com/800x400.png?text=OmniPlant+AI+-+Cognitive+Asset+Intelligence)

## ✨ Core Features

- 🧠 **Agentic P&ID Extraction:** Upload a Piping and Instrumentation Diagram (P&ID) and watch Gemini 2.5 Flash automatically extract equipment, nodes, and flow relationships into a strict JSON schema.
- 🕸️ **Dynamic Knowledge Graph:** Powered by **Neo4j**, visualizing the complex spatial and regulatory relationships between your physical assets.
- ⚡ **Cascading Failure Simulation:** Click a node or ask the AI: *"What happens if Valve V-105 fails closed?"* to trigger a visual cascade analysis of upstream and downstream impacts.
- 💬 **Context-Aware AI Chat:** An integrated Gemini-powered assistant that grounds its answers strictly in your uploaded engineering documents and asset manuals.
- 🚀 **Zero-Latency Fallback:** A robust architecture that seamlessly falls back to an in-memory graph if the Neo4j cloud connection experiences latency during a live demo.

## 🛠️ Technology Stack

- **Frontend:** Next.js (React), TypeScript, React Flow (for Canvas rendering), Vanilla CSS (Glassmorphism UI)
- **Backend:** Python, FastAPI, Uvicorn
- **AI / LLM:** Google Gemini 2.5 Flash (via `google-genai` SDK)
- **Database:** Neo4j AuraDB (Cloud Graph Database)

## 🚀 Quick Start (Local Development)

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/OmniPlant-AI.git
cd OmniPlant-AI
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
NEO4J_URI="neo4j+s://your-id.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="your_password"
```

Start the backend server:
```bash
python main.py
```

### 3. Frontend Setup
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to interact with OmniPlant AI.

## 🚢 Deployment

- **Frontend:** Deployed via [Vercel](https://vercel.com/)
- **Backend:** Deployed via [Render](https://render.com/)
- **Database:** Hosted on [Neo4j AuraDB](https://neo4j.com/cloud/platform/aura-graph-database/)

## 💡 Hackathon Demo Flow
1. **Launch Demo:** Click "Launch Demo (Unit 100)" to instantly load a curated, guaranteed-to-work dataset for a flawless pitch.
2. **Custom Upload:** To prove the AI extraction works, click "Upload Custom Data" and supply an image of a schematic to watch it populate Neo4j live.
3. **Trigger Cascade:** In the chat, type *"What happens if Valve V-105 fails closed?"* and watch the UI highlight the impacted blast radius.
