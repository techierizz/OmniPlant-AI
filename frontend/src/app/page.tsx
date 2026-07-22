"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

// ================================================================
//  TYPE DEFINITIONS
// ================================================================
interface EqData { tag: string; name: string; status: string; equipmentType: string; alert?: boolean; }
interface Message { role: 'user' | 'agent'; content: string; alertLevel?: string; }
interface DocSummary { id: string; title: string; type: string; category: string; preview: string; equipment_tags?: string[]; }
interface MaintEntry { date: string; work_order: string; type: string; description: string; technician: string; }
interface EquipmentDetail {
  tag: string; name: string; type: string; manufacturer: string; model: string;
  install_date: string; last_inspection: string; next_maintenance: string;
  status: string; criticality: string; operating_temp: string; operating_pressure: string;
  location: string; maintenance_history: MaintEntry[]; compliance_standards: string[];
  documents: DocSummary[];
}
interface FullDoc { id: string; title: string; type: string; category: string; content: string; equipment_tags?: string[]; }
interface SearchResult { result_type: string; id: string; title: string; subtitle: string; status?: string; }

// ================================================================
//  INLINE SVG ICONS
// ================================================================
const ValveIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12 L12 4 L22 12 L12 20 Z" /><line x1="9" y1="12" x2="15" y2="12" /></svg>);
const PumpIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 4 L20 12" /><circle cx="12" cy="12" r="2" fill="currentColor" /></svg>);
const TankIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="14" x2="20" y2="14" strokeDasharray="3 2" /></svg>);
const HxIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M7 7 L17 17 M17 7 L7 17" /></svg>);
const SensorIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2 v4 M12 18 v4 M2 12 h4 M18 12 h4" /></svg>);
const ReliefIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4 L20 20 L4 20 Z" /><line x1="12" y1="12" x2="12" y2="16" /><circle cx="12" cy="10" r="1" fill="currentColor" /></svg>);
const ReactorIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 10 Q12 7 15 10 Q12 13 9 10" /><line x1="12" y1="3" x2="12" y2="6" /></svg>);
const SendIcon = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 L11 13 M22 2 L15 22 L11 13 L2 9 Z" /></svg>);

const ICONS: Record<string, React.FC> = { valve: ValveIcon, pump: PumpIcon, tank: TankIcon, heatExchanger: HxIcon, sensor: SensorIcon, relief: ReliefIcon, reactor: ReactorIcon };
const DOC_ICONS: Record<string, string> = { Regulation: '⚖️', SOP: '📘', Manual: '📖', 'Work Order': '🔧', Certificate: '✅', Report: '📊', 'Incident Report': '🚨' };

// ================================================================
//  CUSTOM P&ID NODE
// ================================================================
function EquipmentNode({ data }: { data: EqData }) {
  const IconComp = ICONS[data.equipmentType] || SensorIcon;
  const cssType = data.equipmentType === 'heatExchanger' ? 'heat-exchanger' : data.equipmentType;
  return (
    <div className={`eq-node ${cssType}-node status-${data.status} ${data.alert ? 'cascade-alert' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="eq-node-inner">
        <div className="eq-icon-wrap"><IconComp /></div>
        <div className="eq-node-info">
          <span className="eq-node-tag">{data.tag}</span>
          <span className="eq-node-name">{data.name}</span>
        </div>
      </div>
      <div className="eq-status-bar" />
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

// ================================================================
//  KNOWLEDGE GRAPH NODES
// ================================================================
function KGEquipmentNode({ data }: any) {
  return (
    <div className="kg-node kg-equipment">
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <div className="kg-node-inner"><span className="kg-icon">⚙️</span><span className="kg-label">{data.label}</span></div>
      {data.sublabel && <span className="kg-sublabel">{data.sublabel}</span>}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
function KGDocumentNode({ data }: any) {
  return (
    <div className="kg-node kg-document">
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <div className="kg-node-inner"><span className="kg-icon">{DOC_ICONS[data.docType] || '📄'}</span><span className="kg-label">{data.label}</span></div>
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
function KGRegulationNode({ data }: any) {
  return (
    <div className="kg-node kg-regulation">
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <div className="kg-node-inner"><span className="kg-icon">⚖️</span><span className="kg-label">{data.label}</span></div>
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}

// ================================================================
//  PROCESSING STEPS
// ================================================================
const PROCESSING_STEPS = [
  { icon: '📤', text: 'Uploading P&ID document...' },
  { icon: '🔍', text: 'Analyzing with Gemini Vision AI...' },
  { icon: '🏷️', text: 'Extracting equipment entities (10 found)...' },
  { icon: '🔗', text: 'Building knowledge graph (10 edges)...' },
  { icon: '📚', text: 'Linking 12 regulatory docs & SOPs...' },
  { icon: '✅', text: 'Knowledge graph ready!' },
];

// ================================================================
//  MAIN COMPONENT
// ================================================================
export default function Home() {
  const [phase, setPhase] = useState<'upload' | 'processing' | 'ready'>('upload');
  const [processingStep, setProcessingStep] = useState(0);

  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [canvasTab, setCanvasTab] = useState<'pid' | 'kg'>('pid');
  const [kgNodes, setKgNodes] = useState<any[]>([]);
  const [kgEdges, setKgEdges] = useState<any[]>([]);

  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'history' | 'compliance'>('overview');

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'agent', content: '👋 Welcome to **OmniPlant AI**. I\'m your cognitive asset intelligence agent.\n\nClick any equipment node, then ask me questions like:\n• *"What happens if Valve V-105 fails closed?"*\n• *"Show me maintenance history for Pump P-201"*\n• *"What\'s our compliance status?"*' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [stats, setStats] = useState({ total_assets: 0, total_documents: 0, compliance_score: 0, active_warnings: 0, critical_alerts: 0 });

  // NEW: Search, Document Library, Document Viewer
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showDocLibrary, setShowDocLibrary] = useState(false);
  const [allDocuments, setAllDocuments] = useState<DocSummary[]>([]);
  const [docFilter, setDocFilter] = useState('All');
  const [viewingDoc, setViewingDoc] = useState<FullDoc | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  const nodeTypes = useMemo(() => ({ valve: EquipmentNode, pump: EquipmentNode, tank: EquipmentNode, heatExchanger: EquipmentNode, sensor: EquipmentNode, relief: EquipmentNode, reactor: EquipmentNode }), []);
  const kgNodeTypes = useMemo(() => ({ equipment: KGEquipmentNode, document: KGDocumentNode, regulation: KGRegulationNode }), []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, isTyping]);

  const [customFile, setCustomFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Upload → Processing ---
  const startProcessing = async (useCustom = false) => {
    setPhase('processing');
    setProcessingStep(0);
    
    // Simulate steps for UI effect
    const advanceSteps = (delay: number) => {
      PROCESSING_STEPS.forEach((_, i) => {
        setTimeout(() => {
          setProcessingStep(i);
        }, i * delay);
      });
    };
    
    if (useCustom && customFile) {
      advanceSteps(1500); // Slower animation while waiting
      try {
        const formData = new FormData();
        formData.append('files', customFile);
        const res = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        setProcessingStep(PROCESSING_STEPS.length - 1);
        setTimeout(() => { fetchGraph(); fetchStats(); setPhase('ready'); }, 1000);
      } catch (e) {
        console.error(e);
        alert('Custom upload failed or took too long. Check backend logs or API key.');
        setPhase('upload');
      }
    } else {
      // Fast demo processing
      advanceSteps(1000);
      setTimeout(() => {
        setProcessingStep(PROCESSING_STEPS.length - 1);
        setTimeout(() => { fetchGraph(); fetchStats(); setPhase('ready'); }, 1000);
      }, PROCESSING_STEPS.length * 1000);
    }
  };

  const handleReset = async () => {
    try {
      await fetch('http://localhost:8000/reset', { method: 'POST' });
      setNodes([]); setEdges([]); setKgNodes([]); setKgEdges([]); setSelectedEquipment(null);
      fetchGraph(); fetchStats();
      setPhase('upload');
    } catch (e) {
      console.error('Reset failed:', e);
    }
  };


  const fetchGraph = () => {
    fetch('http://localhost:8000/graph').then(r => r.json()).then(data => {
      const rfNodes = data.nodes.map((n: any) => ({
        id: n.id, type: n.equipment_type, position: n.position,
        data: { tag: n.tag, name: n.name, status: n.status, equipmentType: n.equipment_type, alert: false } as EqData,
      }));
      const rfEdges = data.edges.map((e: any) => {
        const isSignal = e.line_type === 'signal', isBypass = e.line_type === 'bypass', isRelief = e.line_type === 'relief';
        return {
          id: e.id, source: e.source, target: e.target, label: e.label, type: 'smoothstep', animated: !isSignal,
          style: { stroke: isRelief ? '#ef4444' : isBypass ? '#f59e0b' : isSignal ? '#64748b' : '#94a3b8', strokeWidth: isSignal ? 1 : 1.5, strokeDasharray: (isSignal || isBypass || isRelief) ? '6 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color: isRelief ? '#ef4444' : isBypass ? '#f59e0b' : '#94a3b8' },
        };
      });
      setNodes(rfNodes); setEdges(rfEdges);
    }).catch(err => console.error('Graph fetch error:', err));
  };

  const fetchStats = () => { fetch('http://localhost:8000/stats').then(r => r.json()).then(setStats).catch(console.error); };

  const fetchKnowledgeGraph = () => {
    fetch('http://localhost:8000/knowledge-graph').then(r => r.json()).then(data => {
      const rfNodes = data.nodes.map((n: any) => ({
        id: n.id, type: n.node_type, position: n.position,
        data: { label: n.label, sublabel: n.sublabel, status: n.status, docType: n.doc_type, nodeType: n.node_type },
      }));
      const rfEdges = data.edges.map((e: any) => ({
        id: e.id, source: e.source, target: e.target, label: e.label, type: 'smoothstep',
        style: { stroke: e.edge_type === 'regulation' ? '#f59e0b' : '#3b82f6', strokeWidth: 1, strokeDasharray: '4 3' },
        labelStyle: { fontSize: 8, fill: '#64748b' },
        labelBgStyle: { fill: '#0c1425', fillOpacity: 0.8 },
      }));
      setKgNodes(rfNodes); setKgEdges(rfEdges);
    }).catch(console.error);
  };

  // --- Node click ---
  const onNodeClick = useCallback((_: any, node: any) => {
    setActiveTab('overview');
    fetch(`http://localhost:8000/equipment/${node.id}`).then(r => r.json()).then(setSelectedEquipment).catch(console.error);
    setNodes(nds => nds.map(n => ({ ...n, className: n.id === node.id ? 'node-selected' : '' })));
  }, []);

  // --- Chat ---
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput(''); setIsTyping(true);
    try {
      const res = await fetch('http://localhost:8000/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg }) });
      const data = await res.json();
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsTyping(false);
      setChatMessages(prev => [...prev, { role: 'agent', content: data.response, alertLevel: data.alert_level }]);
      if (data.affected_nodes?.length > 0) triggerCascade(data.affected_nodes);
    } catch {
      setIsTyping(false);
      setChatMessages(prev => [...prev, { role: 'agent', content: '❌ Connection error. Ensure backend is running on port 8000.' }]);
    }
  };

  const triggerCascade = (ids: string[]) => {
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, alert: false } })));
    ids.forEach((id, i) => { setTimeout(() => { setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, alert: true } } : n)); }, i * 600); });
  };
  const resetCascade = () => { setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, alert: false } }))); };

  // --- Search ---
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) { setSearchResults([]); setShowSearchResults(false); return; }
    searchTimeoutRef.current = setTimeout(() => {
      fetch(`http://localhost:8000/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(data => { setSearchResults(data); setShowSearchResults(true); }).catch(console.error);
    }, 300);
  };

  // --- Doc Library ---
  const openDocLibrary = () => {
    fetch('http://localhost:8000/documents').then(r => r.json()).then(docs => { setAllDocuments(docs); setShowDocLibrary(true); }).catch(console.error);
  };

  const openDocViewer = (docId: string) => {
    fetch(`http://localhost:8000/documents/${docId}`).then(r => r.json()).then(setViewingDoc).catch(console.error);
  };

  // --- Canvas tab switch ---
  useEffect(() => { if (canvasTab === 'kg' && kgNodes.length === 0) fetchKnowledgeGraph(); }, [canvasTab]);

  // --- Markdown formatter ---
  const formatMessage = (content: string) => {
    return content.split('\n').map((line, i) => {
      if (line === '---') return <hr key={i} />;
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const formatted = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={j}>{part.slice(2, -2)}</strong>;
        const ips = part.split(/(\*[^*]+\*)/g);
        return ips.map((ip, k) => ip.startsWith('*') && ip.endsWith('*') && !ip.startsWith('**') ? <em key={`${j}-${k}`} style={{ color: 'var(--text-secondary)' }}>{ip.slice(1, -1)}</em> : ip);
      });
      if (line.startsWith('• ') || line.startsWith('- ')) return <div key={i} style={{ paddingLeft: '12px', marginBottom: '3px' }}>{formatted}</div>;
      if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: '12px', marginBottom: '3px' }}>{formatted}</div>;
      return <div key={i} style={{ marginBottom: line === '' ? '6px' : '2px' }}>{formatted}</div>;
    });
  };

  const filteredDocs = docFilter === 'All' ? allDocuments : allDocuments.filter(d => d.type === docFilter);
  const docTypes = ['All', ...Array.from(new Set(allDocuments.map(d => d.type)))];

  // ================================================================
  //  RENDER
  // ================================================================

  if (phase === 'upload') {
    return (
      <div className="omniplant-root">
        <div className="upload-screen">
          <div className="upload-zone glass">
            <div className="upload-icon">📐</div>
            <h2>OmniPlant AI Knowledge Extraction</h2>
            <p style={{marginBottom: 24}}>Build a dynamic knowledge graph from your engineering diagrams.</p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400}}>
              {/* Option A: Demo */}
              <button className="upload-btn" type="button" onClick={() => startProcessing(false)}>
                🚀 Launch Demo (Unit 100 Dataset)
              </button>
              
              <div style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem'}}>— OR —</div>
              
              {/* Option B: Custom Upload */}
              <div style={{border: '1px dashed var(--border)', borderRadius: 8, padding: 16, textAlign: 'center'}}>
                <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12}}>
                  {customFile ? `Selected: ${customFile.name}` : 'Upload your own P&ID document'}
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{display: 'none'}} 
                  accept="image/png, image/jpeg, application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCustomFile(e.target.files[0]);
                    }
                  }}
                />
                <div style={{display: 'flex', gap: 8, justifyContent: 'center'}}>
                  <button 
                    className="upload-btn" 
                    style={{background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '8px 16px', fontSize: '0.85rem'}}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select File
                  </button>
                  {customFile && (
                    <button 
                      className="upload-btn" 
                      style={{padding: '8px 16px', fontSize: '0.85rem'}}
                      onClick={() => startProcessing(true)}
                    >
                      Extract (Gemini API)
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="upload-formats" style={{marginTop: 32}}>Supports: PDF, PNG, JPEG</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'processing') {
    const progress = Math.round(((processingStep + 1) / PROCESSING_STEPS.length) * 100);
    return (
      <div className="omniplant-root">
        <div className="processing-screen">
          <div className="processing-card glass">
            <h2>🧠 OmniPlant AI Processing</h2>
            <div className="processing-sub">Extracting intelligence from P&ID_Unit100.pdf</div>
            <div className="processing-steps">
              {PROCESSING_STEPS.map((step, i) => (
                <div key={i} className={`processing-step ${i < processingStep ? 'done' : i === processingStep ? 'active' : ''}`}>
                  <span className="step-icon">{i < processingStep ? '✅' : step.icon}</span>
                  <span>{step.text}</span>
                </div>
              ))}
            </div>
            <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD ---
  return (
    <div className="omniplant-root fade-in">
      {/* HEADER */}
      <header className="omniplant-header">
        <div className="header-brand">
          <div className="logo-icon">🏭</div>
          <h1>OmniPlant<span>AI</span></h1>
          <span className="tagline">Cognitive Asset Intelligence</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* SEARCH BAR */}
          <div className="search-wrapper">
            <span className="search-icon-wrap">🔍</span>
            <input className="search-input" type="text" placeholder="Search assets, docs, standards..." value={searchQuery}
              onChange={e => handleSearch(e.target.value)} onFocus={() => searchResults.length > 0 && setShowSearchResults(true)} onBlur={() => setTimeout(() => setShowSearchResults(false), 200)} />
            {showSearchResults && (
              <div className="search-results">
                {searchResults.length > 0 ? searchResults.map((r, i) => (
                  <div key={i} className="search-result-item" onMouseDown={() => { if (r.result_type === 'document') openDocViewer(r.id); setShowSearchResults(false); setSearchQuery(''); }}>
                    <span className="search-result-icon">{r.result_type === 'equipment' ? '⚙️' : '📄'}</span>
                    <div className="search-result-info">
                      <div className="search-result-title">{r.title}</div>
                      <div className="search-result-sub">{r.subtitle}</div>
                    </div>
                  </div>
                )) : <div className="search-empty">No results found</div>}
              </div>
            )}
          </div>
          {/* RESET BUTTON */}
          <button className="header-btn" style={{borderColor: 'var(--amber)', color: 'var(--amber)'}} onClick={handleReset}>
            🔄 Reset to Demo
          </button>
          {/* DOC LIBRARY BUTTON */}
          <button className="header-btn" onClick={openDocLibrary}>📚 Document Library</button>
          {/* STATS */}
          <div className="header-stats">
            <div className="stat-card"><div className="stat-icon">⚡</div><div className="stat-info"><span className="stat-value">{stats.total_assets}</span><span className="stat-label">Assets</span></div></div>
            <div className="stat-card"><div className="stat-icon">📄</div><div className="stat-info"><span className="stat-value">{stats.total_documents}</span><span className="stat-label">Documents</span></div></div>
            <div className="stat-card success"><div className="stat-icon">✅</div><div className="stat-info"><span className="stat-value">{stats.compliance_score}%</span><span className="stat-label">Compliance</span></div></div>
            <div className={`stat-card ${stats.active_warnings > 0 ? 'warning' : ''}`}><div className="stat-icon">⚠️</div><div className="stat-info"><span className="stat-value">{stats.active_warnings}</span><span className="stat-label">Warnings</span></div></div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="omniplant-body">
        {/* CANVAS SECTION */}
        <div className="canvas-section">
          {/* Canvas Tabs */}
          <div className="canvas-tabs">
            <button className={`canvas-tab ${canvasTab === 'pid' ? 'active' : ''}`} onClick={() => setCanvasTab('pid')}>📐 P&ID View</button>
            <button className={`canvas-tab ${canvasTab === 'kg' ? 'active' : ''}`} onClick={() => setCanvasTab('kg')}>🕸️ Knowledge Graph</button>
            <div style={{ flex: 1 }} />
            {canvasTab === 'pid' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px' }}>
                <div className="toolbar-title"><span className="dot" />Process Flow — Unit 100</div>
                <button className="toolbar-badge" style={{ cursor: 'pointer', border: '1px solid var(--border)' }} onClick={resetCascade}>Reset View</button>
              </div>
            )}
            {canvasTab === 'kg' && <div style={{ display: 'flex', alignItems: 'center', paddingRight: '12px' }}><span className="toolbar-badge">{kgNodes.length} Nodes · {kgEdges.length} Relationships</span></div>}
          </div>

          {/* P&ID Canvas */}
          {canvasTab === 'pid' && (
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.3 }} proOptions={{ hideAttribution: true }} minZoom={0.3} maxZoom={2}>
              <Background color="#1e293b" gap={30} size={1} style={{ opacity: 0.3 }} />
              <Controls />
              <MiniMap nodeColor={(n: any) => { if (n.data?.alert) return '#ef4444'; if (n.data?.status === 'warning') return '#f59e0b'; return '#06b6d4'; }} maskColor="rgba(6, 11, 24, 0.8)" style={{ height: 80, width: 120 }} />
            </ReactFlow>
          )}

          {/* Knowledge Graph Canvas */}
          {canvasTab === 'kg' && (
            <div style={{ flex: 1, position: 'relative' }}>
              <ReactFlow nodes={kgNodes} edges={kgEdges} nodeTypes={kgNodeTypes} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} minZoom={0.15} maxZoom={1.5}>
                <Background color="#1e293b" gap={30} size={1} style={{ opacity: 0.2 }} />
                <Controls />
              </ReactFlow>
              <div className="kg-legend">
                <div className="kg-legend-item"><div className="kg-legend-dot eq" />Equipment</div>
                <div className="kg-legend-item"><div className="kg-legend-dot doc" />Documents</div>
                <div className="kg-legend-item"><div className="kg-legend-dot reg" />Regulations</div>
              </div>
            </div>
          )}
        </div>

        {/* INTELLIGENCE SIDEBAR */}
        <div className="intelligence-panel">
          <div className="asset-panel">
            <div className="asset-panel-header"><h2>🔍 Asset Intelligence</h2></div>
            {selectedEquipment ? (
              <>
                <div className="asset-tabs">
                  {(['overview', 'documents', 'history', 'compliance'] as const).map(tab => (
                    <button key={tab} className={`asset-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="asset-content">
                  {activeTab === 'overview' && (
                    <div className="slide-up">
                      <div className="eq-detail-header">
                        <div className={`eq-detail-icon ${selectedEquipment.status}`}>{(() => { const IC = ICONS[nodes.find(n => n.id === selectedEquipment.tag)?.type] || SensorIcon; return <IC />; })()}</div>
                        <div className="eq-detail-info">
                          <h3>{selectedEquipment.name}</h3>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                            <span className="eq-tag-badge">{selectedEquipment.tag}</span>
                            <span className={`status-badge ${selectedEquipment.status}`}><span className="status-dot-sm" />{selectedEquipment.status}</span>
                          </div>
                          <div className="eq-type">{selectedEquipment.type} · {selectedEquipment.manufacturer}</div>
                        </div>
                      </div>
                      <div className="spec-grid">
                        <div className="spec-item"><div className="spec-label">Model</div><div className="spec-value" style={{ fontSize: '0.75rem' }}>{selectedEquipment.model}</div></div>
                        <div className="spec-item"><div className="spec-label">Criticality</div><div className="spec-value" style={{ color: selectedEquipment.criticality === 'Critical' ? 'var(--red)' : selectedEquipment.criticality === 'High' ? 'var(--amber)' : 'var(--emerald)' }}>{selectedEquipment.criticality}</div></div>
                        <div className="spec-item"><div className="spec-label">Temperature</div><div className="spec-value">{selectedEquipment.operating_temp}</div></div>
                        <div className="spec-item"><div className="spec-label">Pressure</div><div className="spec-value">{selectedEquipment.operating_pressure}</div></div>
                        <div className="spec-item"><div className="spec-label">Installed</div><div className="spec-value">{selectedEquipment.install_date}</div></div>
                        <div className="spec-item"><div className="spec-label">Next PM</div><div className="spec-value">{selectedEquipment.next_maintenance}</div></div>
                      </div>
                    </div>
                  )}
                  {activeTab === 'documents' && (
                    <div className="slide-up">
                      <div className="section-title">Linked Documents ({selectedEquipment.documents.length})</div>
                      {selectedEquipment.documents.map(doc => (
                        <div key={doc.id} className="doc-card" onClick={() => openDocViewer(doc.id)}>
                          <div className={`doc-icon ${doc.type.toLowerCase().replace(/\s/g, '-')}`}>{DOC_ICONS[doc.type] || '📄'}</div>
                          <div className="doc-info"><div className="doc-title">{doc.title}</div><div className="doc-cat">{doc.category}</div><div className="doc-preview">{doc.preview}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTab === 'history' && (
                    <div className="slide-up">
                      <div className="section-title">Maintenance Timeline</div>
                      {selectedEquipment.maintenance_history.map((entry, i) => (
                        <div key={i} className="timeline-item">
                          <div className={`timeline-dot ${entry.type}`} />
                          <div className="timeline-content">
                            <div className="timeline-date">{entry.date} · {entry.work_order}</div>
                            <div className="timeline-type" style={{ color: entry.type === 'Corrective' ? 'var(--amber)' : entry.type === 'Inspection' ? 'var(--blue)' : 'var(--emerald)' }}>{entry.type}</div>
                            <div className="timeline-desc">{entry.description}</div>
                            <div className="timeline-tech">Technician: {entry.technician}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTab === 'compliance' && (
                    <div className="slide-up">
                      <div className="section-title">Applicable Standards</div>
                      <div className="compliance-tags">{selectedEquipment.compliance_standards.map((s, i) => <span key={i} className="compliance-tag">{s}</span>)}</div>
                      <div className="section-title">Location</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedEquipment.location}</div>
                      <div className="section-title">Last Inspection</div>
                      <div style={{ fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace" }}>{selectedEquipment.last_inspection}</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="asset-content"><div className="asset-empty"><div className="empty-icon">🔍</div><div>Select an equipment node on the canvas</div><div style={{ fontSize: '0.75rem' }}>to view its complete intelligence profile</div></div></div>
            )}
          </div>

          {/* CHAT */}
          <div className="chat-panel">
            <div className="chat-panel-header"><div className="agent-dot" /><h2>🤖 Agent Chat</h2></div>
            <div className="chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`msg ${msg.role} ${msg.alertLevel === 'critical' ? 'critical-msg' : ''}`}>
                  {msg.role === 'agent' ? formatMessage(msg.content) : msg.content}
                </div>
              ))}
              {isTyping && <div className="typing-indicator"><span /><span /><span /></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input-area" onSubmit={handleSend}>
              <input className="chat-input" type="text" placeholder="Ask OmniPlant Agent..." value={chatInput} onChange={e => setChatInput(e.target.value)} />
              <button type="submit" className="chat-send-btn"><SendIcon /></button>
            </form>
          </div>
        </div>
      </div>

      {/* ============ DOCUMENT LIBRARY MODAL ============ */}
      {showDocLibrary && (
        <div className="modal-overlay" onClick={() => setShowDocLibrary(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📚 Document Library ({allDocuments.length} documents)</h2>
              <button className="modal-close" onClick={() => setShowDocLibrary(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="doc-library-filters">
                {docTypes.map(t => <button key={t} className={`filter-btn ${docFilter === t ? 'active' : ''}`} onClick={() => setDocFilter(t)}>{t}</button>)}
              </div>
              <div className="doc-library-grid">
                {filteredDocs.map(doc => (
                  <div key={doc.id} className="doc-card" onClick={() => { openDocViewer(doc.id); setShowDocLibrary(false); }}>
                    <div className={`doc-icon ${doc.type.toLowerCase().replace(/\s/g, '-')}`}>{DOC_ICONS[doc.type] || '📄'}</div>
                    <div className="doc-info">
                      <div className="doc-title">{doc.title}</div>
                      <div className="doc-cat">{doc.category} · {(doc.equipment_tags || []).join(', ')}</div>
                      <div className="doc-preview">{doc.preview}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ DOCUMENT VIEWER MODAL ============ */}
      {viewingDoc && (
        <div className="modal-overlay" onClick={() => setViewingDoc(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{viewingDoc.title}</h2>
              <button className="modal-close" onClick={() => setViewingDoc(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="doc-viewer-meta">
                <span className="meta-tag">Type: {viewingDoc.type}</span>
                <span className="meta-tag">Category: {viewingDoc.category}</span>
                {(viewingDoc.equipment_tags || []).map(t => <span key={t} className="meta-tag">Equipment: {t}</span>)}
              </div>
              <div className="doc-viewer-content">{viewingDoc.content}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
