import os
import json
import math
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from neo4j import GraphDatabase

load_dotenv()

app = FastAPI(title="OmniPlant AI Backend", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Loading ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def load_json(filename):
    with open(os.path.join(DATA_DIR, filename), 'r') as f:
        return json.load(f)

ORIGINAL_PID_DATA = load_json("mock_pid_data.json")
ORIGINAL_DOCUMENTS = load_json("mock_documents.json")
ORIGINAL_EQUIPMENT = load_json("mock_equipment.json")

PID_DATA = json.loads(json.dumps(ORIGINAL_PID_DATA))
DOCUMENTS = json.loads(json.dumps(ORIGINAL_DOCUMENTS))
EQUIPMENT = json.loads(json.dumps(ORIGINAL_EQUIPMENT))

# --- Gemini AI Setup (optional fallback) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = None

if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    try:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        print("[OK] Gemini AI connected successfully")
    except Exception as e:
        print(f"[WARN] Gemini setup failed (demo will use curated responses): {e}")
else:
    print("[INFO] No Gemini API key found. Using curated demo responses only.")

# --- Neo4j Database Setup ---
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USERNAME")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD")
neo4j_driver = None

if NEO4J_URI and NEO4J_USER and NEO4J_PASS:
    try:
        neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
        neo4j_driver.verify_connectivity()
        print("[OK] Connected to Neo4j AuraDB successfully.")
    except Exception as e:
        print(f"[WARN] Neo4j connection failed: {e}")
        neo4j_driver = None
else:
    print("[INFO] Neo4j credentials missing. Using in-memory fallback.")


def query_gemini(message: str) -> Optional[str]:
    """Query Gemini with full document corpus as context."""
    if not gemini_client:
        return None
    try:
        doc_context = "\n\n---\n\n".join([
            f"**{d['title']}** (Type: {d['type']})\n{d['content']}"
            for d in DOCUMENTS
        ])
        eq_context = "\n".join([
            f"- {tag}: {eq['name']} ({eq['type']}) | Status: {eq['status']} | Criticality: {eq['criticality']} | Standards: {', '.join(eq.get('compliance_standards', []))}"
            for tag, eq in EQUIPMENT.items()
        ])

        prompt = f"""You are OmniPlant AI, an expert industrial knowledge intelligence agent for Unit 100 of a chemical processing plant.

EQUIPMENT IN THIS UNIT:
{eq_context}

DOCUMENT CORPUS:
{doc_context}

INSTRUCTIONS:
- Answer using ONLY information from the documents and equipment data above.
- Always cite specific document names and section numbers when referencing information.
- Use markdown: **bold** for emphasis, bullet points for lists.
- If you identify safety or compliance concerns, flag them with ⚠️.
- If the question is about equipment, include its current status and recent maintenance.
- Be thorough but concise. Structure your response with clear sections.

QUESTION: {message}"""

        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        return response.text
    except Exception as e:
        print(f"Gemini query error: {e}")
        return None


# --- Models ---
class ChatRequest(BaseModel):
    message: str
    selected_node: Optional[str] = None


# ===================================================================
#  ENDPOINTS
# ===================================================================

@app.get("/")
def root():
    return {"name": "OmniPlant AI", "version": "3.0", "status": "online", "gemini": gemini_client is not None}


@app.get("/graph")
def get_graph():
    return PID_DATA


@app.get("/stats")
def get_stats():
    # Try Neo4j first
    if neo4j_driver:
        try:
            with neo4j_driver.session() as session:
                total_assets = session.run("MATCH (e:Equipment) RETURN count(e) as c").single()["c"]
                total_docs = session.run("MATCH (d:Document) RETURN count(d) as c").single()["c"]
                warnings = session.run("MATCH (e:Equipment {status: 'warning'}) RETURN count(e) as c").single()["c"]
                critical = session.run("MATCH (e:Equipment {status: 'critical'}) RETURN count(e) as c").single()["c"]
                compliance_pct = round(((total_assets - critical) / total_assets) * 100) if total_assets else 100
                print("[INFO] Served /stats from Neo4j")
                return {
                    "total_assets": total_assets,
                    "total_documents": total_docs,
                    "compliance_score": compliance_pct,
                    "active_warnings": warnings,
                    "critical_alerts": critical,
                }
        except Exception as e:
            print(f"[WARN] Neo4j read failed, falling back to memory: {e}")

    # In-memory fallback
    total_assets = len(PID_DATA["nodes"])
    total_docs = len(DOCUMENTS)
    warnings = sum(1 for n in PID_DATA["nodes"] if EQUIPMENT.get(n["id"], {}).get("status") == "warning")
    critical = sum(1 for n in PID_DATA["nodes"] if EQUIPMENT.get(n["id"], {}).get("status") == "critical")
    compliance_pct = round(((total_assets - critical) / total_assets) * 100) if total_assets else 100
    print("[INFO] Served /stats from Memory")
    return {
        "total_assets": total_assets,
        "total_documents": total_docs,
        "compliance_score": compliance_pct,
        "active_warnings": warnings,
        "critical_alerts": critical,
    }


@app.get("/equipment/{tag}")
def get_equipment(tag: str):
    eq = EQUIPMENT.get(tag)
    if not eq:
        raise HTTPException(status_code=404, detail=f"Equipment {tag} not found")
    linked_docs = []
    for doc in DOCUMENTS:
        if tag in doc.get("equipment_tags", []):
            linked_docs.append({
                "id": doc["id"],
                "title": doc["title"],
                "type": doc["type"],
                "category": doc["category"],
                "preview": doc["content"][:120] + "..."
            })
    eq_copy = dict(eq)
    eq_copy["documents"] = linked_docs
    return eq_copy


@app.get("/documents")
def get_all_documents():
    return [
        {
            "id": d["id"],
            "title": d["title"],
            "type": d["type"],
            "category": d["category"],
            "equipment_tags": d.get("equipment_tags", []),
            "preview": d["content"][:150] + "..."
        }
        for d in DOCUMENTS
    ]


@app.get("/documents/{doc_id}")
def get_document(doc_id: str):
    for doc in DOCUMENTS:
        if doc["id"] == doc_id:
            return doc
    raise HTTPException(status_code=404, detail="Document not found")


# --- Search Endpoint ---
@app.get("/search")
def search(q: str = Query(..., min_length=1)):
    q_lower = q.lower()
    results = []
    for tag, eq in EQUIPMENT.items():
        if q_lower in tag.lower() or q_lower in eq["name"].lower() or q_lower in eq["type"].lower() or q_lower in eq.get("manufacturer", "").lower():
            results.append({"result_type": "equipment", "id": tag, "title": f"{tag}: {eq['name']}", "subtitle": eq["type"], "status": eq["status"]})
    for doc in DOCUMENTS:
        if q_lower in doc["title"].lower() or q_lower in doc["content"].lower() or q_lower in doc["type"].lower():
            results.append({"result_type": "document", "id": doc["id"], "title": doc["title"], "subtitle": doc["type"]})
    for tag, eq in EQUIPMENT.items():
        for std in eq.get("compliance_standards", []):
            if q_lower in std.lower():
                if not any(r["id"] == tag and r["result_type"] == "equipment" for r in results):
                    results.append({"result_type": "equipment", "id": tag, "title": f"{tag}: {eq['name']}", "subtitle": f"Governed by {std}", "status": eq["status"]})
    return results[:20]


# --- Knowledge Graph Endpoint ---
@app.get("/knowledge-graph")
def get_knowledge_graph():
    nodes = []
    edges = []
    cx, cy = 600, 450

    # Inner ring: Equipment nodes
    eq_tags = list(EQUIPMENT.keys())
    n_eq = len(eq_tags)
    for i, tag in enumerate(eq_tags):
        angle = (2 * math.pi / n_eq) * i - math.pi / 2
        eq = EQUIPMENT[tag]
        nodes.append({
            "id": tag,
            "node_type": "equipment",
            "label": tag,
            "sublabel": eq["name"],
            "status": eq["status"],
            "position": {"x": round(cx + 230 * math.cos(angle)), "y": round(cy + 230 * math.sin(angle))}
        })

    # Middle ring: Document nodes
    n_docs = len(DOCUMENTS)
    for i, doc in enumerate(DOCUMENTS):
        angle = (2 * math.pi / n_docs) * i + 0.1
        short_title = doc["title"][:28] + ("..." if len(doc["title"]) > 28 else "")
        nodes.append({
            "id": doc["id"],
            "node_type": "document",
            "label": short_title,
            "doc_type": doc["type"],
            "position": {"x": round(cx + 480 * math.cos(angle)), "y": round(cy + 400 * math.sin(angle))}
        })
        for tag in doc.get("equipment_tags", []):
            edges.append({
                "id": f"kg_d_{doc['id']}_{tag}",
                "source": doc["id"],
                "target": tag,
                "label": "DOCUMENTS",
                "edge_type": "document"
            })

    # Outer ring: Regulation / Standard nodes
    all_standards = {}
    for tag, eq in EQUIPMENT.items():
        for std in eq.get("compliance_standards", []):
            if std not in all_standards:
                all_standards[std] = []
            all_standards[std].append(tag)

    std_list = list(all_standards.keys())
    n_std = len(std_list)
    for i, std in enumerate(std_list):
        angle = (2 * math.pi / n_std) * i + math.pi / n_std
        nodes.append({
            "id": f"std_{std}",
            "node_type": "regulation",
            "label": std,
            "position": {"x": round(cx + 700 * math.cos(angle)), "y": round(cy + 520 * math.sin(angle))}
        })
        for tag in all_standards[std]:
            edges.append({
                "id": f"kg_s_{std}_{tag}",
                "source": tag,
                "target": f"std_{std}",
                "label": "GOVERNED_BY",
                "edge_type": "regulation"
            })

    return {"nodes": nodes, "edges": edges}


# ===================================================================
#  AGENTIC CHAT — Curated scenarios + Gemini fallback
# ===================================================================

@app.post("/chat")
def chat(request: ChatRequest):
    msg = request.message.lower()

    # === SCENARIO 1: Cascading Failure (The WOW Demo) ===
    if any(kw in msg for kw in ["v-105", "valve fails", "what happens if", "fails closed", "cascade", "failure"]):
        return {
            "response": (
                "🚨 **CRITICAL CASCADE FAILURE ANALYSIS**\n\n"
                "**Trigger Event:** Valve V-105 fails closed\n\n"
                "---\n\n"
                "**⚡ Cascade Sequence:**\n\n"
                "• **T+0 min** — V-105 blocks main feed flow to Pump P-201\n"
                "• **T+3 min** — P-201 starves, cavitation onset *(OEM Manual: KPD+ §7.2)*\n"
                "• **T+8 min** — P-201 mechanical seal failure if not shut down\n"
                "• **T+12 min** — HX-301 loses process flow, outlet temp dropping\n\n"
                "---\n\n"
                "**⚠️ Compliance Violations Detected:**\n\n"
                "• **OISD-114 §6.3** — Pressure relief path compromised\n"
                "• **Factory Act 1948** — Unsafe operating condition\n\n"
                "---\n\n"
                "**✅ Recommended Immediate Actions:**\n\n"
                "1. Open bypass valve **V-106** immediately *(SOP-402, Step 1)*\n"
                "2. Monitor P-201 discharge pressure — shutdown if < 8.0 bar\n"
                "3. Verify PSV-202 is functional for overpressure protection\n\n"
                "---\n\n"
                "**📋 Auto-Generated Maintenance Ticket:**\n"
                "Ticket **#MT-2025-0091** drafted for V-105 actuator repair.\n"
                "Priority: **URGENT** | Assigned: R. Sharma\n\n"
                "⚠️ *Note: WO-98422 shows V-105 actuator was already sticking on 2024-11-20. "
                "This is a recurring issue — recommend full actuator replacement per MOC-2024-112.*\n\n"
                "---\n"
                "*Sources: SOP-402 · OISD-114 · OEM Manual P-201 §7.2 · WO-98422*"
            ),
            "alert_level": "critical",
            "affected_nodes": ["V-105", "P-201", "HX-301"],
            "documents_referenced": ["doc_1", "doc_2", "doc_3", "doc_4"]
        }

    # === SCENARIO 2: Maintenance Query ===
    elif any(kw in msg for kw in ["maintenance", "history", "work order", "repair", "p-201", "pump"]):
        return {
            "response": (
                "🔧 **Maintenance Intelligence: Pump P-201**\n\n"
                "**Equipment:** Kirloskar KPD+ 65x40-250 Centrifugal Pump\n"
                "**Status:** Operational | **Criticality:** High\n\n"
                "---\n\n"
                "**📊 Maintenance Timeline:**\n\n"
                "• **2024-09-12** (WO-97200) — Preventive: Bearing replacement & alignment\n"
                "• **2024-03-20** (WO-93800) — Corrective: Mechanical seal replaced\n"
                "• **2023-09-15** (WO-89900) — Preventive: Semi-annual PM, all normal\n\n"
                "---\n\n"
                "**🔮 Predictive Insight:**\n\n"
                "Based on the maintenance pattern, the next bearing replacement is predicted around **2025-05** "
                "(~8000 operating hours per OEM spec §9.1). Current vibration trend is stable at 2.1 mm/s.\n\n"
                "**⚠️ Risk Flag:** The upstream valve V-105 has a known sticking issue (WO-98422). "
                "If V-105 fails, P-201 will cavitate within 3 minutes.\n\n"
                "---\n"
                "*Sources: OEM Manual §9.1 · WO-97200 · WO-93800 · WO-98422*"
            ),
            "alert_level": "info",
            "affected_nodes": ["P-201"],
            "documents_referenced": ["doc_3", "doc_6", "doc_4"]
        }

    # === SCENARIO 3: Compliance Query ===
    elif any(kw in msg for kw in ["compliance", "regulation", "oisd", "peso", "factory act", "audit", "inspection"]):
        return {
            "response": (
                "📋 **Compliance Intelligence Report — Unit 100**\n\n"
                "---\n\n"
                "**✅ Compliant:**\n\n"
                "• PSV-202 — Pop test passed 2024-12-01 *(API-576, OISD-114)*\n"
                "• R-401 — PESO registration valid until 2029 *(PESO/PV/2019/4521)*\n"
                "• T-100, T-501 — Tank inspections current *(OISD-117, API-650)*\n"
                "• TI-301, PI-401 — Calibrations current *(IEC-61508)*\n\n"
                "**⚠️ Attention Required:**\n\n"
                "• **V-105** — Known actuator sticking. Violates **OISD-114 §6.3** reliability requirement.\n"
                "• **P-201** — Next bearing PM due **2025-03-12**. Overdue PM = **API-610 / OISD-116** finding.\n\n"
                "---\n\n"
                "**📦 Audit Package Auto-Generated:**\n"
                "12 documents compiled for regulatory audit readiness.\n\n"
                "---\n"
                "*Standards checked: OISD-114, OISD-116, OISD-117, API-598, API-610, API-650, PESO, Factory Act 1948, ASME VIII*"
            ),
            "alert_level": "warning",
            "affected_nodes": ["V-105", "P-201"],
            "documents_referenced": ["doc_1", "doc_5", "doc_8", "doc_11"]
        }

    # === SCENARIO 4: Incident / Lessons Learned ===
    elif any(kw in msg for kw in ["incident", "near miss", "lesson", "similar", "past events", "pattern"]):
        return {
            "response": (
                "📊 **Lessons Learned Intelligence**\n\n"
                "---\n\n"
                "**🔍 Pattern Detected:**\n\n"
                "**IR-2023-047** (2023-07-14) — Near Miss at Product Tank T-501\n"
                "A faulty level transmitter nearly caused an operator to shut the product inlet valve, "
                "risking a reactor pressure excursion in R-401.\n\n"
                "**Root Cause:** Single-point instrument failure\n"
                "**Corrective Action:** Redundant radar level measurement installed.\n\n"
                "---\n\n"
                "**⚠️ Systemic Pattern:**\n\n"
                "Both this incident and the V-105 sticking issue share: **single-point failures in safety-critical paths**.\n\n"
                "1. Conduct redundancy review for all SIL-rated components\n"
                "2. Update HAZOP with recent near-miss data\n"
                "3. Common-cause failure analysis across Unit 100\n\n"
                "---\n"
                "*Sources: IR-2023-047 · WO-98422 · HAZOP Unit 100 Rev.3*"
            ),
            "alert_level": "info",
            "affected_nodes": ["T-501", "R-401"],
            "documents_referenced": ["doc_12", "doc_4"]
        }

    # === GEMINI FALLBACK: Real AI for any other question ===
    else:
        gemini_response = query_gemini(request.message)
        if gemini_response:
            return {
                "response": gemini_response,
                "alert_level": "info",
                "affected_nodes": [],
                "documents_referenced": []
            }

        # Final fallback if no Gemini
        return {
            "response": (
                "👋 I'm the **OmniPlant AI Agent**. I can help you with:\n\n"
                "• **Cascade Analysis** — *\"What happens if Valve V-105 fails closed?\"*\n"
                "• **Maintenance Intel** — *\"Show me the maintenance history for Pump P-201\"*\n"
                "• **Compliance Check** — *\"What's our compliance status for Unit 100?\"*\n"
                "• **Lessons Learned** — *\"Are there similar past incidents?\"*\n\n"
                "Try clicking on any equipment node, then ask me about it!"
            ),
            "alert_level": "info",
            "affected_nodes": [],
            "documents_referenced": []
        }



@app.post("/reset")
def reset_data():
    global PID_DATA, DOCUMENTS, EQUIPMENT
    PID_DATA = json.loads(json.dumps(ORIGINAL_PID_DATA))
    DOCUMENTS = json.loads(json.dumps(ORIGINAL_DOCUMENTS))
    EQUIPMENT = json.loads(json.dumps(ORIGINAL_EQUIPMENT))
    return {"status": "success", "message": "Reset to Demo Dataset"}

@app.post("/upload")
async def upload_custom_data(files: List[UploadFile] = File(...)):
    global PID_DATA, DOCUMENTS, EQUIPMENT
    
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini API key required for custom uploads. Please add GEMINI_API_KEY to your .env file.")
    
    try:
        # Read the first file for P&ID analysis (assuming it's an image or PDF)
        contents = await files[0].read()
        mime_type = files[0].content_type or "image/png"
        
        prompt = """You are an Industrial Knowledge Graph extraction agent. 
Analyze the uploaded document (P&ID or manual) and extract the equipment, connections, and metadata.
Return ONLY valid JSON matching this exact structure:
{
  "graph": {
    "nodes": [ {"id": "V-100", "equipment_type": "valve", "position": {"x":100, "y":100}, "tag": "V-100", "name": "Valve 1", "status": "operational"} ],
    "edges": [ {"id": "e1", "source": "V-100", "target": "P-100", "label": "flow", "line_type": "process"} ]
  },
  "equipment": {
    "V-100": { "tag": "V-100", "name": "Valve 1", "type": "Gate Valve", "manufacturer": "Unknown", "model": "Unknown", "install_date": "2020-01-01", "last_inspection": "2024-01-01", "next_maintenance": "2025-01-01", "status": "operational", "criticality": "Medium", "operating_temp": "Ambient", "operating_pressure": "1 bar", "location": "Unit 1", "maintenance_history": [], "compliance_standards": ["API-598"], "linked_documents": ["doc_1"], "linked_sops": [] }
  },
  "documents": [
    { "id": "doc_1", "title": "Custom Document", "type": "Manual", "category": "Operations", "content": "Extracted text here...", "equipment_tags": ["V-100"] }
  ]
}
Do NOT wrap the JSON in markdown blocks. Ensure all node IDs match the equipment dictionary keys.
If you find more equipment, add them. Generate reasonable mock metadata if it's missing in the diagram (e.g. manufacturer, pressure).

CRITICAL UI REQUIREMENT: You MUST assign realistic, widely spaced "x" and "y" coordinates for the `position` of each node so they do not overlap on the canvas. 
- Use x values ranging from 100 to 1200, and y values ranging from 100 to 800.
- Space nodes out logically: e.g., if A connects to B, place B at least 300 pixels to the right (x + 300) or below (y + 200) A.
- NEVER give two nodes the same coordinates. Spread them out!
"""
        
        print(f"[INFO] Sending file {files[0].filename} to Gemini for extraction...")
        
        from google.genai import types
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=contents, mime_type=mime_type),
                prompt
            ]
        )
        
        raw_text = response.text.strip()
        # Clean markdown if present
        if raw_text.startswith("```json"):
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
            
        data = json.loads(raw_text)
        
        # Update global state (Memory Fallback)
        PID_DATA = data.get("graph", {"nodes": [], "edges": []})
        EQUIPMENT = data.get("equipment", {})
        DOCUMENTS = data.get("documents", [])
        
        # Write to Neo4j if available
        if neo4j_driver:
            try:
                with neo4j_driver.session() as session:
                    print("[INFO] Pushing extracted data to Neo4j...")
                    # Clear existing
                    session.run("MATCH (n) DETACH DELETE n")
                    
                    # Merge Equipment
                    for tag, eq in EQUIPMENT.items():
                        session.run("""
                            MERGE (e:Equipment {tag: $tag})
                            SET e.name = $name, e.type = $type, e.status = $status, e.criticality = $criticality
                        """, tag=tag, name=eq.get("name"), type=eq.get("type"), status=eq.get("status"), criticality=eq.get("criticality"))
                    
                    # Merge Documents
                    for doc in DOCUMENTS:
                        session.run("""
                            MERGE (d:Document {id: $id})
                            SET d.title = $title, d.type = $type, d.category = $category
                        """, id=doc.get("id"), title=doc.get("title"), type=doc.get("type"), category=doc.get("category"))
                        
                        # Link Document to Equipment
                        for tag in doc.get("equipment_tags", []):
                            session.run("""
                                MATCH (d:Document {id: $id}), (e:Equipment {tag: $tag})
                                MERGE (d)-[:REFERENCES]->(e)
                            """, id=doc.get("id"), tag=tag)
                            
                    # Merge Connections (Edges)
                    for edge in PID_DATA.get("edges", []):
                        session.run("""
                            MATCH (source:Equipment {tag: $source}), (target:Equipment {tag: $target})
                            MERGE (source)-[:CONNECTED_TO {label: $label, line_type: $line_type}]->(target)
                        """, source=edge.get("source"), target=edge.get("target"), label=edge.get("label"), line_type=edge.get("line_type"))
                        
                    print("[OK] Successfully pushed to Neo4j AuraDB.")
            except Exception as e:
                print(f"[WARN] Failed to write to Neo4j. Operating in memory-only mode: {e}")

        print(f"[OK] Extraction successful: {len(PID_DATA.get('nodes', []))} nodes found.")
        return {"status": "success", "message": "Custom data loaded"}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] Upload processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process files: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
