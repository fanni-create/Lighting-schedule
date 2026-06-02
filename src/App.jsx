/* eslint-disable */
import { useState, useMemo, useRef, useEffect } from "react";

// Load Montserrat font
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

const DEFAULT_MANUFACTURERS = ["Acuity Brands", "Cree Lighting", "Eaton", "GE Current", "Hubbell", "Lithonia", "Philips", "RAB Lighting", "Signify"];
const DEFAULT_REPS = ["Alpha Lighting", "Brightside Rep Group", "Coastal Lighting", "Delta Sales", "East Coast Reps", "Frontier Lighting", "Gulf States", "Heritage Reps"];
const FIXTURE_TYPES = ["Troffer", "High Bay", "Wall Pack", "Street Light", "Downlight", "Strip Light", "Panel", "Flood Light", "Canopy", "Exit Sign"];
const COLOR_TEMPS = ["2700K", "3000K", "3500K", "4000K", "5000K", "6500K"];
const CRI_OPTIONS = ["70 CRI", "80 CRI", "90 CRI", "95+ CRI"];

const kelvinToHex = (k) => {
  const n = parseInt(k);
  if (n <= 2700) return "#ffb347";
  if (n <= 3000) return "#ffc97a";
  if (n <= 3500) return "#ffd9a0";
  if (n <= 4000) return "#fff0cc";
  if (n <= 5000) return "#fffde0";
  return "#e8f4ff";
};

let idCounter = 1;
const emptyFixture = () => ({
  id: idCounter++, name: "", type: "", manufacturer: "", rep: "",
  modelNumber: "", wattage: "", colorTemp: "", cri: "", voltage: "",
  lumens: "", distributorNet: "", qty: 1, notes: "", image: null,
  cutsheet: null, cutsheetName: "", cutsheetPageImages: null,
  isLinear: false, linearFt: "",
});

// ─── Managed Select ───────────────────────────────────────────────────────────
function ManagedSelect({ label, value, onChange, options, onAddOption }) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const handleAdd = () => {
    const t = newVal.trim(); if (!t) return;
    onAddOption(t); onChange(t); setNewVal(""); setAdding(false);
  };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {adding ? (
        <div style={{ display: "flex", gap: "6px" }}>
          <input autoFocus value={newVal} onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            placeholder={`New ${label.toLowerCase()}…`} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleAdd} style={miniBtn("#cc0000", "#fff")}>Add</button>
          <button onClick={() => setAdding(false)} style={miniBtn("#222", "#888")}>✕</button>
        </div>
      ) : (
        <select value={value} onChange={e => e.target.value === "__add__" ? setAdding(true) : onChange(e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__add__">＋ Add new…</option>
        </select>
      )}
    </div>
  );
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────
function FixtureThumbnail({ image, onClick }) {
  return (
    <div onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ width: "40px", height: "40px", borderRadius: "7px", flexShrink: 0, background: image ? "transparent" : "#1a1a1a", border: `1px dashed ${image ? "transparent" : "#2e2e2e"}`, overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {image ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "16px", opacity: 0.4 }}>📷</span>}
    </div>
  );
}

// ─── Fixture Row ──────────────────────────────────────────────────────────────
function FixtureRow({ fixture, onUpdate, onDelete, isEditing, onEditToggle, manufacturers, reps, onAddManufacturer, onAddRep, fixtureTypes: fixtureTypesProp, onAddFixtureType, showPricing = true, onSaveToLibrary }) {
  const [local, setLocal] = useState(fixture);
  const imageRef = useRef(); const cutsheetRef = useRef();

  const set = (field, val) => { const u = { ...local, [field]: val }; setLocal(u); onUpdate(u); };
  useMemo(() => { setLocal(fixture); }, [fixture]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImg = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => set("image", ev.target.result); r.readAsDataURL(f); };
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);

  const handlePDF = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setConverting(true);
    setConvertError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(",")[1];

      const interim = { ...local, cutsheet: dataUrl, cutsheetName: f.name, cutsheetPageImages: null };
      setLocal(interim); onUpdate(interim);

      try {
        const brandLogo = window.__brandLogo || null;
        // Extract highlight terms from model number field
        const modelLines = (local.modelNumber || "").split("\n").map(l => l.trim()).filter(l => l.length >= 3);
        const res = await fetch("/api/convert-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, filename: f.name, logoBase64: brandLogo, highlightTerms: modelLines }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const { pages } = await res.json();
        if (!pages || pages.length === 0) throw new Error("No pages returned");

        const updated = { ...local, cutsheet: dataUrl, cutsheetName: f.name, cutsheetPageImages: pages };
        setLocal(updated); onUpdate(updated);
      } catch(err) {
        setConvertError(err.message);
        console.error("PDF error:", err);
      } finally {
        setConverting(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const totalNet = local.distributorNet && local.qty
    ? `$${(parseFloat(local.distributorNet) * parseInt(local.qty || 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
  const ctColor = local.colorTemp ? kelvinToHex(local.colorTemp) : "#555";

  return (
    <div style={{ background: isEditing ? "#f5f5f5" : "#2a2a2a", border: `1px solid ${isEditing ? "#ddd" : "#3a3a3a"}`, borderRadius: "10px", marginBottom: "8px", overflow: "hidden", transition: "all 0.2s" }}>
      <input ref={imageRef} type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} />
      <input ref={cutsheetRef} type="file" accept="application/pdf" onChange={handlePDF} style={{ display: "none" }} />

      <div style={{ display: "grid", gridTemplateColumns: showPricing ? "48px 2fr 1fr 90px 80px 90px 100px 44px" : "48px 2fr 1fr 90px 80px 44px", alignItems: "center", padding: "10px 16px", cursor: "pointer" }} onClick={onEditToggle}>
        <FixtureThumbnail image={local.image} onClick={() => imageRef.current?.click()} />
        <div style={{ paddingLeft: "12px" }}>
          <div style={{ fontWeight: "600", fontSize: "13px", color: local.name ? "#e8e8e8" : "#444", display: "flex", alignItems: "center", gap: "8px" }}>
            {local.name || <em style={{ color: "#444", fontWeight: 400 }}>Untitled fixture</em>}
          </div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "2px", display: "flex", gap: "8px", alignItems: "center" }}>
            {local.type && <span>{local.type}</span>}
            {local.modelNumber && <span style={{ color: "#444" }}>{local.modelNumber.split("\n")[0]}{local.modelNumber.includes("\n") ? " …" : ""}</span>}
            {local.isLinear && local.linearFt && <span style={{ color: "#7ab3f5", fontSize: "10px" }}>📏 {local.linearFt} LF</span>}
            {local.cutsheet && <span style={{ color: "#7ab3f5", fontSize: "10px" }}>📄 cutsheet</span>}
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>{local.rep || <span style={{ color: "#333" }}>—</span>}</div>
        <div>{local.wattage ? <span style={{ fontSize: "12px", color: "#c0d4ff" }}>{local.wattage}W</span> : <span style={{ color: "#333", fontSize: "12px" }}>—</span>}</div>
        <div>{local.colorTemp ? <span style={{ fontSize: "11px", color: ctColor, background: ctColor + "18", border: `1px solid ${ctColor}30`, borderRadius: "4px", padding: "2px 6px", fontFamily: "monospace" }}>{local.colorTemp}</span> : <span style={{ color: "#333", fontSize: "12px" }}>—</span>}</div>
        {showPricing && <div style={{ fontSize: "12px", color: "#aaa" }}>{local.distributorNet ? `$${parseFloat(local.distributorNet).toFixed(2)}` : <span style={{ color: "#333" }}>—</span>}</div>}
        {showPricing && <div style={{ fontSize: "12px", color: "#6fba6f", fontWeight: "600" }}>{totalNet}</div>}
        {onSaveToLibrary && <button onClick={e => { e.stopPropagation(); onSaveToLibrary(); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "11px", padding: "0 4px", lineHeight: 1, whiteSpace: "nowrap" }} title="Save to library">📚</button>}
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "16px", padding: 0, lineHeight: 1 }}
          onMouseEnter={e => e.target.style.color = "#c0504d"} onMouseLeave={e => e.target.style.color = "#444"}>×</button>
      </div>

      {isEditing && (
        <div style={{ borderTop: "1px solid #ddd", padding: "16px", background: "#f5f5f5" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            {/* Image */}
            <div>
              <label style={labelStyle}>Fixture Image</label>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ width: "72px", height: "72px", borderRadius: "9px", overflow: "hidden", flexShrink: 0, background: "#fff", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {local.image ? <img src={local.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "22px", opacity: 0.3 }}>📷</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <button onClick={() => imageRef.current?.click()} style={{ background: "#555", border: "1px solid #666", borderRadius: "7px", padding: "6px 12px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>{local.image ? "Change" : "Upload Image"}</button>
                  {local.image && <button onClick={() => set("image", null)} style={{ background: "none", border: "none", color: "#555", fontSize: "11px", cursor: "pointer", padding: 0 }}>Remove</button>}
                  <span style={{ fontSize: "10px", color: "#3a3a3a" }}>PNG, JPG, WebP</span>
                </div>
              </div>
            </div>
            {/* Cutsheet */}
            <div>
              <label style={labelStyle}>Cutsheet <span style={{ color: "#7ab3f5" }}>PDF</span></label>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ width: "72px", height: "72px", borderRadius: "9px", flexShrink: 0,
                  background: local.cutsheetPageImages ? "#0a1f0a" : local.cutsheet ? "#0d1f35" : "#1a1a1a",
                  border: `1px dashed ${local.cutsheetPageImages ? "#2e6e2e" : local.cutsheet ? "#2e5a8e" : "#2e2e2e"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <span style={{ fontSize: "22px" }}>
                    {local.cutsheetPageImages ? "🖼" : local.cutsheet ? "📄" : "📋"}
                  </span>
                  {local.cutsheetPageImages && <span style={{ fontSize: "9px", color: "#6fba6f", fontFamily: "monospace" }}>{local.cutsheetPageImages.length}p</span>}
                  {local.cutsheet && !local.cutsheetPageImages && !converting && <span style={{ fontSize: "9px", color: "#7ab3f5", fontFamily: "monospace" }}>PDF</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                  <button onClick={() => cutsheetRef.current?.click()} disabled={converting}
                    style={{ background: local.cutsheetPageImages ? "#2e6e2e" : local.cutsheet ? "#2e5a8e" : "#555",
                      border: `1px solid ${local.cutsheetPageImages ? "#3a8a3a" : local.cutsheet ? "#4a7aaa" : "#666"}`,
                      borderRadius: "7px", padding: "6px 12px",
                      color: "#fff",
                      fontSize: "12px", cursor: converting ? "not-allowed" : "pointer", opacity: converting ? 0.5 : 1 }}>
                    {local.cutsheetPageImages ? "Replace PDF" : "Upload PDF"}
                  </button>
                  {converting && (
                    <div>
                      <span style={{ fontSize: "10px", color: "#f5a623", display: "block" }}>⏳ Converting + stamping logo…</span>
                      <span style={{ fontSize: "10px", color: "#555" }}>30–60 sec depending on pages</span>
                    </div>
                  )}
                  {local.cutsheetPageImages && !converting && (
                    <div>
                      <span style={{ fontSize: "10px", color: "#4a7aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px", display: "block" }}>{local.cutsheetName}</span>
                      <span style={{ fontSize: "10px", color: "#6fba6f" }}>✓ {local.cutsheetPageImages.length} page{local.cutsheetPageImages.length !== 1 ? "s" : ""} · logo stamped</span>
                    </div>
                  )}
                  {convertError && !converting && (
                    <span style={{ fontSize: "10px", color: "#cc0000" }}>⚠ {convertError}</span>
                  )}
                  {!local.cutsheet && !converting && (
                    <span style={{ fontSize: "10px", color: "#3a3a3a" }}>PDF · logo auto-stamped on each page</span>
                  )}
                  {local.cutsheet && (
                    <button onClick={() => { set("cutsheet", null); set("cutsheetName", ""); set("cutsheetPageImages", null); setConvertError(null); }}
                      style={{ background: "none", border: "none", color: "#555", fontSize: "11px", cursor: "pointer", padding: 0 }}>Remove</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            <Field label="Fixture Name" value={local.name} onChange={v => set("name", v)} placeholder="e.g. L-2 Downlight or F1 Panel" />
            <ManagedSelect label="Fixture Type" value={local.type} onChange={v => set("type", v)} options={fixtureTypesProp || FIXTURE_TYPES} onAddOption={onAddFixtureType || (() => {})} />
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Model Number(s)</label>
              <textarea value={local.modelNumber} onChange={e => set("modelNumber", e.target.value)}
                placeholder={"e.g. LT4-40L-835\nHousing: LT4-HSG-WH\nTrim: LT4-TRIM-BK"}
                style={{ ...inputStyle, height: "72px", resize: "vertical", fontFamily: "monospace", fontSize: "12px", lineHeight: "1.6" }} />
              <span style={{ fontSize: "10px", color: "#444", marginTop: "3px", display: "block" }}>Add housing, trim, driver or accessory model numbers on separate lines</span>
            </div>
            <ManagedSelect label="Manufacturer" value={local.manufacturer} onChange={v => set("manufacturer", v)} options={manufacturers} onAddOption={onAddManufacturer} />
            <ManagedSelect label="Rep" value={local.rep} onChange={v => set("rep", v)} options={reps} onAddOption={onAddRep} />
            <Field label="Wattage (W)" value={local.wattage} onChange={v => set("wattage", v)} placeholder="e.g. 40" type="number" />
            <SimpleSelect label="Color Temp" value={local.colorTemp} onChange={v => set("colorTemp", v)} options={COLOR_TEMPS} />
            <SimpleSelect label="CRI" value={local.cri} onChange={v => set("cri", v)} options={CRI_OPTIONS} />
            <Field label="Lumens" value={local.lumens} onChange={v => set("lumens", v)} placeholder="e.g. 4500" type="number" />
            <Field label="Voltage" value={local.voltage} onChange={v => set("voltage", v)} placeholder="e.g. 120-277V" />
            <Field label="Distributor Net ($)" value={local.distributorNet} onChange={v => set("distributorNet", v)} placeholder="e.g. 84.50" type="number" />
            <Field label="Qty" value={local.qty} onChange={v => set("qty", v)} placeholder="1" type="number" />
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "16px", padding: "10px 12px", background: "#fff", borderRadius: "7px", border: "1px solid #ddd" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
                <div onClick={() => set("isLinear", !local.isLinear)} style={{ width: "36px", height: "20px", borderRadius: "10px", background: local.isLinear ? "#cc0000" : "#ccc", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "3px", left: local.isLinear ? "19px" : "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#333" }}>Linear Fixture</span>
              </label>
              {local.isLinear && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                  <input type="number" value={local.linearFt} onChange={e => set("linearFt", e.target.value)}
                    placeholder="e.g. 24"
                    style={{ ...inputStyle, width: "100px", margin: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#555" }}>LF</span>
                  {local.linearFt && local.qty && (
                    <span style={{ fontSize: "11px", color: "#888" }}>
                      ({(parseFloat(local.linearFt) * parseInt(local.qty || 1)).toFixed(1)} LF total)
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={local.notes} onChange={e => set("notes", e.target.value)} placeholder="Dimming, mounting, special requirements…"
                style={{ ...inputStyle, height: "64px", resize: "vertical", fontFamily: "inherit" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return <div><label style={labelStyle}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} /></div>;
}
function SimpleSelect({ label, value, onChange, options }) {
  return <div><label style={labelStyle}>{label}</label><select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}><option value="">—</option>{options.map(o => <option key={o}>{o}</option>)}</select></div>;
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({ manufacturers, reps, onAddManufacturer, onAddRep, onRemoveManufacturer, onRemoveRep, brand, onBrandChange, onClose, fixtureTypesList, onAddFixtureTypeSettings, onRemoveFixtureTypeSettings }) {
  const [newMfr, setNewMfr] = useState("");
  const [newRep, setNewRep] = useState("");
  const [newFtype, setNewFtype] = useState("");
  const [tab, setTab] = useState("brand");
  const logoRef = useRef();

  const handleLogo = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      // Compress logo to max 200px height to keep localStorage small
      const img = new window.Image();
      img.onload = () => {
        const maxH = 200;
        const scale = img.height > maxH ? maxH / img.height : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        onBrandChange({ ...brand, logo: canvas.toDataURL("image/png", 0.85), logoName: f.name });
      };
      img.src = ev.target.result;
    };
    r.readAsDataURL(f);
  };

  const tabStyle = (t) => ({
    padding: "7px 16px", fontSize: "12px", fontWeight: "600", cursor: "pointer", borderRadius: "6px",
    background: tab === t ? "#cc0000" : "transparent", color: tab === t ? "#fff" : "#666",
    border: "none", transition: "all 0.15s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "14px", padding: "28px", width: "600px", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", color: "#fff", fontWeight: "700" }}>Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: "20px", cursor: "pointer" }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "22px", background: "#0e0e0e", borderRadius: "8px", padding: "4px" }}>
          <button style={tabStyle("brand")} onClick={() => setTab("brand")}>🎨 Branding</button>
          <button style={tabStyle("lists")} onClick={() => setTab("lists")}>📋 Lists</button>
        </div>

        {tab === "brand" && (
          <div>
            <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />

            {/* Logo upload */}
            <label style={{ ...labelStyle, color: "#cc0000", marginBottom: "10px" }}>COMPANY LOGO</label>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              <div style={{ width: "120px", height: "60px", borderRadius: "8px", background: "#fff", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                {brand.logo
                  ? <img src={brand.logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  : <span style={{ fontSize: "11px", color: "#444" }}>No logo</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button onClick={() => logoRef.current?.click()} style={{ background: "#1e1e1e", border: "1px solid #2e2e2e", borderRadius: "7px", padding: "7px 14px", color: "#ccc", fontSize: "12px", cursor: "pointer" }}>
                  {brand.logo ? "Replace Logo" : "Upload Logo"}
                </button>
                {brand.logo && <button onClick={() => onBrandChange({ ...brand, logo: null, logoName: "" })} style={{ background: "none", border: "none", color: "#555", fontSize: "11px", cursor: "pointer", padding: 0 }}>Remove logo</button>}
                <span style={{ fontSize: "10px", color: "#3a3a3a" }}>PNG, JPG, SVG · appears on every exported page</span>
              </div>
            </div>

            {/* Company name */}
            <label style={{ ...labelStyle, color: "#cc0000", marginBottom: "6px" }}>COMPANY NAME</label>
            <input value={brand.name} onChange={e => onBrandChange({ ...brand, name: e.target.value })}
              placeholder="e.g. Acme Lighting Solutions"
              style={{ ...inputStyle, marginBottom: "20px" }} />

            {/* Preview */}
            <label style={{ ...labelStyle, color: "#cc0000", marginBottom: "10px" }}>EXPORT PREVIEW</label>
            <div style={{ background: "#fff", borderRadius: "8px", padding: "16px 20px", border: "1px solid #2a2a2a" }}>
              <div style={{ borderBottom: "3px solid #cc0000", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  {brand.logo && <img src={brand.logo} alt="" style={{ height: "36px", maxWidth: "100px", objectFit: "contain" }} />}
                  <div>
                    {brand.name && <div style={{ fontSize: "13px", fontWeight: "800", color: "#111", letterSpacing: "-0.01em" }}>{brand.name}</div>}
                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#cc0000", letterSpacing: "0.05em" }}>FIXTURE SCHEDULE BOOK</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "#bbb", letterSpacing: "0.1em" }}>TOTAL DISTRIBUTOR NET</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#cc0000" }}>$0.00</div>
                </div>
              </div>
              <div style={{ marginTop: "10px", display: "flex", gap: "6px" }}>
                {["#111", "#cc0000", "#fff"].map(c => (
                  <div key={c} style={{ width: "20px", height: "20px", borderRadius: "4px", background: c, border: "1px solid #ddd" }} />
                ))}
                <span style={{ fontSize: "10px", color: "#aaa", alignSelf: "center", marginLeft: "4px" }}>Brand colors: black · red · white</span>
              </div>
            </div>
          </div>
        )}

        {tab === "lists" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "28px" }}>
            {[["MANUFACTURERS", newMfr, setNewMfr, manufacturers, onAddManufacturer, onRemoveManufacturer],
              ["REPS", newRep, setNewRep, reps, onAddRep, onRemoveRep],
              ["FIXTURE TYPES", newFtype, setNewFtype, fixtureTypesList, onAddFixtureTypeSettings, onRemoveFixtureTypeSettings]].map(([title, val, setVal, list, onAdd, onRemove]) => (
              <div key={title}>
                <label style={{ ...labelStyle, color: "#cc0000", marginBottom: "10px" }}>{title}</label>
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  <input value={val} onChange={e => setVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }}
                    placeholder="Add…" style={{ ...inputStyle, fontSize: "12px", padding: "6px 9px" }} />
                  <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }} style={miniBtn("#cc0000", "#fff")}>Add</button>
                </div>
                {list.map(item => (
                  <div key={item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#3a3a3a", borderRadius: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: "#ccc" }}>{item}</span>
                    <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "14px", padding: 0 }}
                      onMouseEnter={e => e.target.style.color = "#c0504d"} onMouseLeave={e => e.target.style.color = "#444"}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportScheduleBook(fixtures, grouped, brand, projectName, showPricing = true) {
  const fmtMoney = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // eslint-disable-next-line no-unused-vars
  const totalNet = fixtures.reduce((s, f) => s + (parseFloat(f.distributorNet || 0) * parseInt(f.qty || 1) || 0), 0);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const cutsheetCount = fixtures.filter(f => f.cutsheet).length;

  const logoHtml = brand.logo ? `<img src="${brand.logo}" alt="logo" style="height:48px;max-width:160px;object-fit:contain;display:block;" />` : "";
  const companyHtml = brand.name ? `<div style="font-size:15px;font-weight:800;color:#111;letter-spacing:-0.01em;line-height:1.1;">${brand.name}</div>` : "";

  const specSections = grouped.map(([mfr, mfrFixtures]) => {
    const mfrTotal = mfrFixtures.reduce((s, f) => s + (parseFloat(f.distributorNet || 0) * parseInt(f.qty || 1) || 0), 0);
    const rows = mfrFixtures.map(f => {
      const tNet = f.distributorNet ? fmtMoney(parseFloat(f.distributorNet) * parseInt(f.qty || 1)) : "—";
      const imgCell = f.image
        ? `<img src="${f.image}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #ddd;display:block;" />`
        : `<div style="width:48px;height:48px;border-radius:6px;border:1px dashed #ddd;"></div>`;
      const tags = [
        f.type && `<span class="tag">${f.type}</span>`,
        f.isLinear && f.linearFt && `<span class="tag" style="background:#e8f0fe;border-color:#4a90e2;color:#1a5cb8;">📏 ${f.linearFt} LF · ${(parseFloat(f.linearFt) * parseInt(f.qty||1)).toFixed(1)} LF total</span>`,
        f.wattage && `<span class="tag">${f.wattage}W</span>`,
        f.colorTemp && `<span class="tag ct" style="background:${kelvinToHex(f.colorTemp)}22;border-color:${kelvinToHex(f.colorTemp)}66;">${f.colorTemp}</span>`,
        f.cri && `<span class="tag">${f.cri}</span>`,
        f.lumens && `<span class="tag">${parseInt(f.lumens).toLocaleString()} lm</span>`,
        f.voltage && `<span class="tag">${f.voltage}</span>`,
      ].filter(Boolean).join("");
      const modelLines = f.modelNumber ? f.modelNumber.split("\n").map(l => l.trim()).filter(Boolean) : [];
      const csBadge = f.cutsheet ? `<span class="cs-badge">📄 cutsheet</span>` : "";
      return `<tr>
        <td style="padding:10px 8px;vertical-align:middle;">${imgCell}</td>
        <td style="padding:10px 8px;vertical-align:top;">
          <div style="font-weight:700;font-size:13px;color:#111;">${f.name || "<em>Untitled</em>"}${csBadge}</div>
          ${modelLines.length ? `<div style="font-size:11px;color:#666;margin-top:3px;font-family:monospace;line-height:1.7;">${modelLines.join("<br/>")}</div>` : ""}
          <div style="margin-top:5px;">${tags}</div>
          ${f.notes ? `<div style="margin-top:5px;font-size:11px;color:#888;font-style:italic;">${f.notes}</div>` : ""}
        </td>
        <td style="padding:10px 8px;vertical-align:middle;font-size:12px;color:#555;">${f.rep || "—"}</td>
        <td style="padding:10px 8px;vertical-align:middle;font-size:12px;text-align:center;">${f.qty || 1}</td>
        ${showPricing ? `<td style="padding:10px 8px;vertical-align:middle;font-size:12px;text-align:right;color:#444;">${f.distributorNet ? fmtMoney(parseFloat(f.distributorNet)) : "—"}</td>
        <td style="padding:10px 8px;vertical-align:middle;font-size:13px;font-weight:800;text-align:right;color:#cc0000;">${tNet}</td>` : ''}
      </tr>`;
    }).join("");
    const fixtureTags = mfrFixtures.map((f, fi) => {
      const globalIdx = grouped.reduce((acc, [m, fs], gi) => gi < grouped.indexOf(grouped.find(([gm]) => gm === mfr)) ? acc + fs.length : acc, 0) + fi + 1;
      return `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#fff;background:#cc0000;border-radius:3px;padding:1px 6px;margin-right:4px;">F${globalIdx}</span><span style="font-size:11px;color:#ccc;margin-right:10px;">${f.name || "Untitled"}</span>`;
    }).join("");
    return `<div class="mfr-section">
      <div class="mfr-header">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <span class="mfr-name">${mfr}</span>
          <div style="display:flex;flex-wrap:wrap;align-items:center;">${fixtureTags}</div>
        </div>
        <span class="mfr-stats">${mfrFixtures.length} fixture${mfrFixtures.length !== 1 ? "s" : ""}${showPricing ? " · " + fmtMoney(mfrTotal) : ""}</span>
      </div>
      <table><thead><tr>
        <th style="width:56px;"></th><th style="text-align:left;">Fixture / Specs</th>
        <th>Rep</th><th style="text-align:center;">Qty</th>
        ${showPricing ? '<th style="text-align:right;">Unit Net</th><th style="text-align:right;">Total Net</th>' : ''}
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");

  const fixturesWithCutsheets = fixtures.filter(f => f.cutsheet);
  const toc = `
    <div class="general-notes">
      <div class="notes-title">GENERAL NOTES</div>
      <ol class="notes-list">
        <li>CONTRACTOR SHALL PROVIDE ALL NECESSARY ACCESSORIES, POWER SUPPLIES, DRIVERS AND COMPONENTS FOR COMPLETE INSTALLATION.</li>
        <li>ALL LENGTHS OF LINEAR PRODUCTS ARE SCALED ON ARCHITECTURAL REFLECTED CEILING PLANS. CONTRACTOR SHALL VERIFY EXACT FIELD LENGTHS PRIOR TO ORDERING.</li>
        <li>AFTER INSTALLATION, AIM AND ADJUST LUMINAIRE FOCUS AND LIGHT LEVELS AS DIRECTED BY THE ARCHITECT AND THE SYSKA LIGHTING DESIGNER.</li>
        <li>CONTRACTOR SHALL VERIFY FINISH WITH CLIENT/ARCHITECT PRIOR TO ORDERING.</li>
        <li>WHERE LOW VOLTAGE FIXTURES ARE SPECIFIED; CONTRACTOR SHALL PROVIDE ALL LEADER OR JUMPER CABLES, MOUNTING TRACK, AND DATA ENABLERS; ELECTRICAL CONTRACTOR SHALL PROVIDE ALL REQUIRED COMPONENTS FOR PROPER OPERATION.</li>
        <li>WHERE LOW VOLTAGE FIXTURES ARE SPECIFIED; CONTRACTOR SHALL PROVIDE REMOTE DIMMABLE POWER SUPPLIES/DRIVERS. DRIVERS SHALL BE INSTALLED IN AN ACCESSIBLE AND PASSIVELY VENTILATED LOCATION FOR MAINTENANCE PURPOSES.</li>
        <li>PRIOR TO PURCHASE OF CUSTOM FABRICATED FIXTURES / ELEMENTS; SHOP DRAWINGS SHALL BE PROVIDED TO THE LIGHTING DESIGNER AND ARCHITECT FROM THE SUPPLIER / GENERAL CONTRACTOR FOR APPROVAL.</li>
        <li>REFERENCE COMCHECK FORMS FOR TOTAL WATTS PER LUMINAIRE.</li>
      </ol>
      <div class="notes-footer">SPECIFIED BY SYSKA HENNESSY GROUP, SAN DIEGO, CA — LIGHTING DESIGN STUDIO WITH PRODUCT SUPPORT FROM LOCAL SAN DIEGO REPS</div>
    </div>`;

  const cutsheetPages = fixturesWithCutsheets.map((f, i) => {
    const modelLines = f.modelNumber ? f.modelNumber.split("\n").map(l => l.trim()).filter(Boolean) : [];
    const num = String(i+1).padStart(2,"0");

    // Build divider page
    const fixtureImgHtml = f.image
      ? `<img src="${f.image}" style="max-width:320px;max-height:320px;object-fit:contain;display:block;margin:0 auto;" />`
      : `<div style="width:200px;height:200px;border:2px dashed #ddd;border-radius:8px;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:14px;">No Image</div>`;

    const dividerPage = `<div class="page-break"></div>
    <div class="divider-page">
      <div class="divider-header">
        ${logoHtml ? `<img src="${f.image ? '' : ''}" style="display:none"/>` : ""}
        <div class="divider-logo">${logoHtml || ""}</div>
        <div class="divider-lnum">${f.name || "Fixture " + num}</div>
      </div>
      <div class="divider-body">
        <div class="divider-img">${fixtureImgHtml}</div>

        ${modelLines.length ? `<div class="divider-model">${modelLines.join("<br/>")}</div>` : ""}
        ${f.manufacturer ? `<div class="divider-mfr">${f.manufacturer}</div>` : ""}
      </div>
      <div class="divider-footer">
        <span>${brand.name || ""}</span>
        <span>${today}</span>
      </div>
    </div>`;

    // Use pre-converted page images if available (always print-safe)
    // Otherwise embed raw PDF (works in Chrome/Edge but may not print)
    let pagesHtml = "";
    if (f.cutsheetPageImages && f.cutsheetPageImages.length > 0) {
      pagesHtml = f.cutsheetPageImages.map((pg, pi) =>
        `<div style="page-break-before:${pi > 0 ? "always" : "auto"};page-break-inside:avoid;">
          <img src="${pg.dataUrl}" style="width:100%;display:block;border:none;" />
        </div>`
      ).join("");
    } else {
      pagesHtml = `<div class="cs-embed-wrap">
        <embed src="${f.cutsheet}" type="application/pdf" width="100%" height="1120" style="display:block;border:none;" />
        <p style="padding:12px 16px;font-size:11px;color:#888;font-style:italic;">
          ⚠ If cutsheet does not display, open this file in Chrome or Edge and allow local file access.
        </p>
      </div>`;
    }

    return dividerPage + `<div class="page-break"></div>
    <div class="cs-divider">
      <div class="cs-header-bar">
        ${logoHtml ? `<div class="cs-logo">${logoHtml}</div>` : ""}
        <div class="cs-meta">
          <span class="cs-num-lg">CS ${num}</span>
          <span class="cs-name-lg">${f.name || "Untitled"}</span>
          ${modelLines.length ? `<span class="cs-model-lg">${modelLines[0]}</span>` : ""}
        </div>
        <div class="cs-mfr-lg">${f.manufacturer || ""}</div>
      </div>
    </div>
    ${pagesHtml}`;
  }).join("");

  const pageFooter = `<div class="page-footer"><span>${brand.name || "Lighting Cutsheet Package"}</span><span>${today}</span></div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${brand.name ? brand.name + " — " : ""}Lighting Cutsheet Package</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Montserrat',Arial,sans-serif;color:#111;background:#fff;font-size:13px;}
  .page{max-width:940px;margin:0 auto;padding:40px 48px 60px;}
  /* ── Cover header ── */
  .book-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:16px;border-bottom:4px solid #cc0000;}
  .header-left{display:flex;align-items:center;gap:16px;}
  .header-title{font-size:11px;font-weight:700;letter-spacing:0.12em;color:#cc0000;text-transform:uppercase;margin-top:4px;}
  .header-right{text-align:right;}
  .fixture-count{font-size:12px;color:#888;font-weight:600;}
  /* ── TOC ── */
  .general-notes{margin:20px 0 28px;padding:20px 24px;background:#fafafa;border-left:4px solid #cc0000;border-radius:0 6px 6px 0;}
  .notes-title{font-size:10px;font-weight:800;letter-spacing:0.18em;color:#cc0000;text-transform:uppercase;margin-bottom:14px;font-family:'Montserrat',Arial,sans-serif;}
  .notes-list{margin:0;padding-left:20px;}
  .notes-list li{font-size:11px;color:#333;line-height:1.8;padding:2px 0;font-weight:500;letter-spacing:0.01em;}
  .notes-footer{margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:8.5px;color:#cc0000;font-weight:700;letter-spacing:0.02em;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  /* ── Section label ── */
  .section-label{font-size:10px;font-weight:700;letter-spacing:0.12em;color:#cc0000;font-family:'JetBrains Mono',monospace;text-transform:uppercase;margin:28px 0 10px;display:flex;align-items:center;gap:10px;}
  .section-label::after{content:"";flex:1;height:2px;background:#cc0000;opacity:0.15;}
  /* ── Manufacturer groups ── */
  .mfr-section{margin-bottom:28px;}
  .mfr-header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:0;background:#111;border-radius:5px 5px 0 0;}
  .mfr-name{font-size:11px;font-weight:700;letter-spacing:0.1em;color:#fff;font-family:'JetBrains Mono',monospace;text-transform:uppercase;}
  .mfr-stats{font-size:11px;color:#aaa;font-family:'JetBrains Mono',monospace;}
  /* ── Table ── */
  table{width:100%;border-collapse:collapse;border:1px solid #e8e8e8;border-top:none;}
  thead th{font-size:10px;color:#888;letter-spacing:0.07em;font-family:'JetBrains Mono',monospace;text-transform:uppercase;padding:7px 8px;border-bottom:1px solid #e8e8e8;font-weight:600;background:#f9f9f9;}
  tbody tr{border-bottom:1px solid #f0f0f0;}
  tbody tr:last-child{border-bottom:none;}
  tbody tr:nth-child(even){background:#fdfdfd;}
  .tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid #ddd;background:#f5f5f5;color:#555;margin-right:3px;margin-bottom:2px;font-family:'JetBrains Mono',monospace;}
  .cs-badge{font-size:10px;color:#cc0000;background:#fff0f0;border:1px solid #ffb3b3;border-radius:3px;padding:1px 6px;font-family:'JetBrains Mono',monospace;margin-left:8px;}
  /* ── Cutsheet divider ── */
  .cs-divider{margin-bottom:0;}
  .cs-header-bar{display:flex;align-items:center;gap:16px;padding:12px 16px;background:#111;border-radius:6px 6px 0 0;}
  .cs-logo img{height:32px;max-width:90px;object-fit:contain;}
  .cs-meta{display:flex;align-items:center;gap:10px;flex:1;}
  .cs-num-lg{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#fff;background:#cc0000;border-radius:4px;padding:2px 8px;flex-shrink:0;}
  .cs-name-lg{font-weight:700;font-size:14px;color:#fff;}
  .cs-model-lg{font-family:'JetBrains Mono',monospace;font-size:11px;color:#aaa;}
  .cs-mfr-lg{font-size:11px;color:#888;margin-left:auto;}
  .cutsheet-embed{background:#f4f4f4;}
  .cs-embed-wrap{background:#fff;margin:0;line-height:0;}
  .divider-page{width:100%;min-height:100vh;display:flex;flex-direction:column;background:#fff;padding:40px 48px;box-sizing:border-box;}
  .divider-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #cc0000;margin-bottom:0;}
  .divider-logo img{height:52px;max-width:160px;object-fit:contain;}
  .divider-lnum{font-family:'Montserrat',Arial,sans-serif;font-size:32px;font-weight:900;color:#cc0000;letter-spacing:-0.01em;line-height:1.1;text-align:right;max-width:50%;}
  .divider-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:40px 0;}
  .divider-img{margin-bottom:8px;}
  .divider-name{font-family:'Montserrat',Arial,sans-serif;font-size:22px;font-weight:700;color:#111;text-align:center;letter-spacing:0.05em;text-transform:uppercase;}
  .divider-model{font-family:'Courier New',monospace;font-size:13px;color:#666;text-align:center;line-height:1.8;}
  .divider-mfr{font-size:13px;color:#aaa;font-weight:600;text-align:center;letter-spacing:0.08em;text-transform:uppercase;}
  .divider-footer{display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#bbb;font-family:'Montserrat',Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;}
  @media print{.divider-page{min-height:100vh;page-break-after:always;}}
  .cs-embed-wrap embed{display:block;width:100%;border:none;}
  @media print{.cs-embed-wrap{page-break-inside:avoid;}}
  /* ── Footer ── */
  .page-footer{margin-top:36px;padding-top:12px;border-top:2px solid #cc0000;display:flex;justify-content:space-between;font-size:10px;color:#bbb;font-family:'JetBrains Mono',monospace;}
  /* ── Utilities ── */
  .page-break{page-break-before:always;break-before:page;}
  .no-print{text-align:center;margin-top:40px;padding:24px;background:#fafafa;border-radius:10px;}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{padding:20px 28px;}
    .no-print{display:none;}
    .cutsheet-embed object{height:100vh;min-height:1050px;}
  }
</style>
</head>
<body>
<div class="page">
  <div class="book-header">
    <div class="header-left">
      ${logoHtml}
      <div>
        ${companyHtml}
        <div style="font-size:22px;font-weight:800;color:#111;letter-spacing:-0.02em;line-height:1.1;">${projectName}</div>
        <div class="header-title">Lighting Cutsheet Package</div>
        <div style="font-size:11px;color:#999;margin-top:3px;">Generated ${today}</div>
      </div>
    </div>
    <div class="header-right">
      <div class="fixture-count">${fixtures.length} fixture${fixtures.length !== 1 ? "s" : ""} · ${grouped.length} manufacturer${grouped.length !== 1 ? "s" : ""}${cutsheetCount > 0 ? ` · ${cutsheetCount} cutsheet${cutsheetCount !== 1 ? "s" : ""}` : ""}</div>
    </div>
  </div>

  ${toc}

  <div class="section-label">Lighting Cutsheet Package</div>
  ${specSections}
  ${pageFooter}

  ${cutsheetPages}

  <div class="no-print" class="no-print">
    <button onclick="window.print()" style="background:#cc0000;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Montserrat',Arial,sans-serif;">🖨 Print / Save as PDF</button>
    <p style="margin-top:10px;font-size:12px;color:#aaa;">Use "Save as PDF" in your browser's print dialog${cutsheetCount > 0 ? ` · ${cutsheetCount} cutsheet${cutsheetCount !== 1 ? "s" : ""} embedded` : ""}</p>
  </div>
</div>
</body>
</html>`;

  // Return single HTML file with everything embedded
  const dateStr = new Date().toISOString().slice(0, 10);
  return [{
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    name: "lighting-cutsheet-package-" + dateStr + ".html",
  }];
}

// ─── Extract fixture type prefix from name (e.g. "L-2 Downlight" → "L-2", "F1 Panel" → "F1") ──
function extractTypeCode(name) {
  if (!name) return "";
  // Match patterns like L-1, L2, F1, D-3, A1, etc. at the start of the name
  const match = name.match(/^([A-Za-z]{1,2}-?\d+)/);
  return match ? match[1].toUpperCase() : "";
}

// ─── Project Tab Bar ──────────────────────────────────────────────────────────
let projIdCounter = 1;
const newProject = (name = "New Project") => ({ id: projIdCounter++, name, fixtures: [], editingId: null });

function ProjectTabs({ projects, activeId, onSelect, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  const startRename = (p, e) => { e.stopPropagation(); setRenamingId(p.id); setRenameVal(p.name); };
  const commitRename = (id) => { if (renameVal.trim()) onRename(id, renameVal.trim()); setRenamingId(null); };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px", overflowX: "auto", padding: "0 28px", background: "#2e2e2e", borderBottom: "1px solid #4a4a4a", minHeight: "42px" }}>
      {projects.map(p => (
        <div key={p.id} onClick={() => onSelect(p.id)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 14px", height: "42px", cursor: "pointer", borderBottom: `2px solid ${activeId === p.id ? "#cc0000" : "transparent"}`, background: activeId === p.id ? "#141414" : "transparent", flexShrink: 0, transition: "all 0.15s" }}>
          {renamingId === p.id ? (
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(p.id)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
              onClick={e => e.stopPropagation()}
              style={{ background: "#222", border: "1px solid #cc0000", borderRadius: "4px", color: "#fff", fontSize: "12px", padding: "2px 6px", width: "120px", outline: "none" }} />
          ) : (
            <>
              <span style={{ fontSize: "12px", fontWeight: activeId === p.id ? "700" : "400", color: activeId === p.id ? "#fff" : "#666", whiteSpace: "nowrap" }}>{p.name}</span>
              {p.fixtures.length > 0 && (
                <span style={{ fontSize: "10px", color: activeId === p.id ? "#cc0000" : "#444", background: activeId === p.id ? "#1a0000" : "#1a1a1a", borderRadius: "10px", padding: "1px 6px", fontFamily: "monospace" }}>{p.fixtures.length}</span>
              )}
              <div style={{ display: "flex", gap: "2px", marginLeft: "2px", opacity: 0 }} className="tab-actions"
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                <button onClick={e => startRename(p, e)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "11px", padding: "1px 3px", lineHeight: 1 }} title="Rename">✎</button>
                {projects.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); onDelete(p.id); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "13px", padding: "1px 3px", lineHeight: 1 }}
                    onMouseEnter={e => e.target.style.color = "#cc0000"} onMouseLeave={e => e.target.style.color = "#555"} title="Delete project">×</button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <button onClick={onAdd} style={{ height: "32px", padding: "0 12px", background: "transparent", border: "1px dashed #2a2a2a", borderRadius: "6px", color: "#555", fontSize: "12px", cursor: "pointer", marginLeft: "6px", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.15s" }}
        onMouseEnter={e => { e.target.style.borderColor = "#cc0000"; e.target.style.color = "#cc0000"; }}
        onMouseLeave={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.color = "#555"; }}>
        + New Project
      </button>
    </div>
  );
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
const STORAGE_KEY = "fixture-schedule-v1";

function saveToStorage(data) {
  try {
    // Store logo separately to avoid hitting size limits
    const { brand, ...rest } = data;
    const { logo, ...brandWithoutLogo } = brand || {};

    // Save main data without logo
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, brand: brandWithoutLogo }));

    // Save logo separately
    if (logo) {
      try {
        localStorage.setItem(STORAGE_KEY + "_logo", logo);
      } catch (e) {
        console.warn("Logo too large for localStorage:", e);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY + "_logo");
    }
  } catch (e) {
    console.warn("localStorage save failed:", e);
    // Try saving without fixtures images as fallback
    try {
      const stripped = {
        ...data,
        projects: data.projects?.map(p => ({
          ...p,
          fixtures: p.fixtures?.map(f => ({ ...f, image: null, cutsheetPageImages: null }))
        }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
    } catch (e2) {
      console.warn("localStorage fallback also failed:", e2);
    }
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.projects && data.projects.length > 0) {
      projIdCounter = Math.max(...data.projects.map(p => p.id)) + 1;
    }
    // Restore logo from separate key
    const logo = localStorage.getItem(STORAGE_KEY + "_logo");
    if (logo && data.brand) {
      data.brand.logo = logo;
    }
    return data;
  } catch (e) {
    return null;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const stored = loadFromStorage();

  const [projects, setProjects] = useState(() => {
    if (stored?.projects?.length) return stored.projects;
    return [newProject("Project 1")];
  });
  const [activeProjectId, setActiveProjectId] = useState(() => {
    if (stored?.activeProjectId) return stored.activeProjectId;
    return projects[0].id;
  });
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [manufacturers, setManufacturers] = useState(() => stored?.manufacturers || [...DEFAULT_MANUFACTURERS]);
  const [reps, setReps] = useState(() => stored?.reps || [...DEFAULT_REPS]);
  const [fixtureTypes, setFixtureTypes] = useState(() => stored?.fixtureTypes || [...FIXTURE_TYPES]);
  const [brand, setBrand] = useState(() => {
    const saved = stored?.brand;
    if (saved?.logo) return saved;
    // Default to public logo if available
    return { logo: "/logo.jpg", logoName: "logo.jpg", name: saved?.name || "" };
  });

  // Keep window.__brandLogo in sync so PDF conversion can access it
  useEffect(() => { window.__brandLogo = brand.logo || null; }, [brand.logo]);
  const [exporting, setExporting] = useState(false);
  const [showPricing, setShowPricing] = useState(true);
  const [viewMode, setViewMode] = useState("schedule"); // "schedule" | "overview" | "library"
  const [library, setLibrary] = useState(() => stored?.library || []);
  const [showAddToLibrary, setShowAddToLibrary] = useState(null); // fixture id
  const [showAddFromLibrary, setShowAddFromLibrary] = useState(false);
  const dlRef = useRef();

  // Auto-save whenever key state changes
  useEffect(() => {
    saveToStorage({ projects, activeProjectId, manufacturers, reps, brand, fixtureTypes, library });
  }, [projects, activeProjectId, manufacturers, reps, brand]);

  // Active project helpers
  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const fixtures = activeProject.fixtures;
  const editingId = activeProject.editingId;

  const updateProject = (id, changes) => setProjects(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
  const setFixtures = (fn) => updateProject(activeProjectId, { fixtures: typeof fn === "function" ? fn(fixtures) : fn });
  const setEditingId = (id) => updateProject(activeProjectId, { editingId: id });

  const addProject = () => {
    const p = newProject("Project " + (projects.length + 1));
    setProjects(prev => [...prev, p]);
    setActiveProjectId(p.id);
    setSearch("");
  };
  const renameProject = (id, name) => updateProject(id, { name });
  const deleteProject = (id) => {
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    if (activeProjectId === id) setActiveProjectId(remaining[0].id);
  };

  const addManufacturer = (m) => setManufacturers(prev => prev.includes(m) ? prev : [...prev, m].sort());
  const removeManufacturer = (m) => setManufacturers(prev => prev.filter(x => x !== m));
  const addRep = (r) => setReps(prev => prev.includes(r) ? prev : [...prev, r].sort());
  const removeRep = (r) => setReps(prev => prev.filter(x => x !== r));

  const addFixture = () => { const f = emptyFixture(); setFixtures(prev => [...prev, f]); setEditingId(f.id); };
  const updateFixture = (u) => setFixtures(prev => prev.map(f => f.id === u.id ? u : f));
  const deleteFixture = (id) => { setFixtures(prev => prev.filter(f => f.id !== id)); if (editingId === id) setEditingId(null); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fixtures.filter(f => !q || [f.name, f.manufacturer, f.type, f.rep, f.modelNumber].some(v => v?.toLowerCase().includes(q)));
  }, [fixtures, search]);

  const grouped = useMemo(() => {
    const g = {}; filtered.forEach(f => { const k = f.manufacturer || "No Manufacturer"; if (!g[k]) g[k] = []; g[k].push(f); });
    return Object.entries(g).sort(([a],[b]) => a.localeCompare(b));
  }, [filtered]);

  const groupedAll = useMemo(() => {
    const g = {}; fixtures.forEach(f => { const k = f.manufacturer || "No Manufacturer"; if (!g[k]) g[k] = []; g[k].push(f); });
    return Object.entries(g).sort(([a],[b]) => a.localeCompare(b));
  }, [fixtures]);

  const totals = useMemo(() => ({
    count: fixtures.length,
    cutsheets: fixtures.filter(f => f.cutsheet).length,
    net: fixtures.reduce((s, f) => s + (parseFloat(f.distributorNet||0) * parseInt(f.qty||1) || 0), 0),
  }), [fixtures]);

  // Grand totals across all projects
  const allFixtures = projects.flatMap(p => p.fixtures);
  const grandNet = allFixtures.reduce((s, f) => s + (parseFloat(f.distributorNet||0) * parseInt(f.qty||1) || 0), 0); // eslint-disable-line no-unused-vars

  return (
    <div style={{ minHeight: "100vh", background: "#3d3d3d", color: "#ccc", fontFamily: "'Montserrat', sans-serif" }}>
      {showSettings && (
        <SettingsModal manufacturers={manufacturers} reps={reps}
          onAddManufacturer={addManufacturer} onAddRep={addRep}
          onRemoveManufacturer={removeManufacturer} onRemoveRep={removeRep}
          brand={brand} onBrandChange={setBrand}
          onClose={() => setShowSettings(false)}
          fixtureTypesList={fixtureTypes}
          onAddFixtureTypeSettings={(t) => setFixtureTypes(prev => prev.includes(t) ? prev : [...prev, t].sort())}
          onRemoveFixtureTypeSettings={(t) => setFixtureTypes(prev => prev.filter(x => x !== t))} />
      )}

      {/* Top header */}
      <div style={{ background: "#333333", borderBottom: "1px solid #4a4a4a", padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {brand.logo && <img src={brand.logo} alt="logo" style={{ height: "26px", maxWidth: "80px", objectFit: "contain", opacity: 0.9 }} />}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#cc0000", boxShadow: "0 0 6px #cc0000" }} />
              <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#cc0000", letterSpacing: "0.12em" }}>FIXTURE SCHEDULE</span>
            </div>
            <h1 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#fff", letterSpacing: "-0.02em" }}>
              {brand.name ? `${brand.name}` : "Lighting Cutsheet Package"} {activeProject.name ? `· ${activeProject.name}` : ""}
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>

          <button onClick={() => setShowSettings(true)} style={{ background: "#3a3a3a", border: "1px solid #2a2a2a", borderRadius: "7px", padding: "7px 11px", color: "#888", fontSize: "13px", cursor: "pointer" }} title="Settings">⚙︎</button>
          <div style={{ display: "flex", background: "#222", borderRadius: "7px", border: "1px solid #2a2a2a", overflow: "hidden" }}>
            <button onClick={() => setViewMode("schedule")} style={{ background: viewMode === "schedule" ? "#cc0000" : "none", color: viewMode === "schedule" ? "#fff" : "#666", border: "none", padding: "6px 12px", fontSize: "11px", fontWeight: "700", cursor: "pointer", letterSpacing: "0.04em" }}>SCHEDULE</button>
            <button onClick={() => setViewMode("overview")} style={{ background: viewMode === "overview" ? "#cc0000" : "none", color: viewMode === "overview" ? "#fff" : "#666", border: "none", padding: "6px 12px", fontSize: "11px", fontWeight: "700", cursor: "pointer", letterSpacing: "0.04em" }}>OVERVIEW</button>
            <button onClick={() => setViewMode("library")} style={{ background: viewMode === "library" ? "#cc0000" : "none", color: viewMode === "library" ? "#fff" : "#666", border: "none", padding: "6px 12px", fontSize: "11px", fontWeight: "700", cursor: "pointer", letterSpacing: "0.04em" }}>LIBRARY {library.length > 0 ? `(${library.length})` : ""}</button>
          </div>
          <button onClick={() => setShowPricing(p => !p)}
            style={{ background: "#1a1a1a", color: showPricing ? "#6fba6f" : "#555", border: `1px solid ${showPricing ? "#2a4a2a" : "#2a2a2a"}`, borderRadius: "7px", padding: "7px 12px", fontWeight: "600", fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {showPricing ? "$ Hide Pricing" : "$ Show Pricing"}
          </button>
          <button onClick={() => { saveToStorage({ projects, activeProjectId, manufacturers, reps, brand, fixtureTypes }); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
            style={{ background: saved ? "#1a0000" : "#1a1a1a", color: saved ? "#cc0000" : "#888", border: `1px solid ${saved ? "#4a0000" : "#2a2a2a"}`, borderRadius: "7px", padding: "7px 12px", fontWeight: "600", fontSize: "12px", cursor: "pointer", transition: "all 0.2s" }}>
            {saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Project tabs */}
      <ProjectTabs
        projects={projects} activeId={activeProjectId}
        onSelect={id => { setActiveProjectId(id); setSearch(""); }}
        onAdd={addProject}
        onRename={renameProject}
        onDelete={deleteProject}
      />

      {/* Project toolbar */}
      <div style={{ background: "#333333", borderBottom: "1px solid #4a4a4a", padding: "10px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>{activeProject.name}</span>
          <div style={{ display: "flex", gap: "16px" }}>
            <Stat label="FIXTURES" value={totals.count} color="#ccc" />
            {totals.cutsheets > 0 && <Stat label="CUTSHEETS" value={totals.cutsheets} color="#7ab3f5" />}
            {projects.length > 1 && (
              <Stat label="ALL PROJECTS" value={`$${grandNet.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`} color="#888" />
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fixtures…"
            style={{ ...inputStyle, width: "150px", margin: 0, fontSize: "12px", padding: "6px 10px" }} />
          <button onClick={addFixture} style={addBtnStyle}>+ Add Fixture</button>
          <button
            onClick={() => {
              if (!fixtures.length || exporting) return;
              setExporting(true);
              try {
                const files = exportScheduleBook(fixtures, groupedAll, brand, activeProject.name, showPricing);
                const file = files[0];
                const url = URL.createObjectURL(file.blob);
                const a = dlRef.current;
                a.href = url; a.download = file.name; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              } catch(e) { console.error(e); }
              finally { setTimeout(() => setExporting(false), 800); }
            }}
            disabled={fixtures.length === 0 || exporting}
            style={{ background: fixtures.length > 0 && !exporting ? "#1a0000" : "#141414", color: fixtures.length > 0 && !exporting ? "#cc0000" : "#444", border: `1px solid ${fixtures.length > 0 && !exporting ? "#4a0000" : "#222"}`, borderRadius: "7px", padding: "7px 12px", fontWeight: "600", fontSize: "12px", cursor: fixtures.length > 0 && !exporting ? "pointer" : "not-allowed", whiteSpace: "nowrap", opacity: exporting ? 0.6 : 1 }}>
            {exporting ? "⏳ Exporting…" : "↓ Export Cutsheet Package"}
          </button>
          <a ref={dlRef} style={{ display: "none" }} href="/" aria-hidden="true">download</a>
        </div>
      </div>

      {/* Library tab */}
      {viewMode === "library" && (
        <div style={{ padding: "24px 28px 60px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#cc0000", fontWeight: "700", letterSpacing: "0.12em", fontFamily: "monospace" }}>FIXTURE LIBRARY</div>
              <div style={{ fontSize: "13px", color: "#bbb", marginTop: "3px" }}>Saved fixtures available across all projects</div>
            </div>
            {library.length > 0 && (
              <button onClick={() => setShowAddFromLibrary(true)}
                style={{ background: "#cc0000", color: "#fff", border: "none", borderRadius: "7px", padding: "8px 16px", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}>
                + Add to Current Project
              </button>
            )}
          </div>

          {library.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#555" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📚</div>
              <p style={{ color: "#888", marginBottom: "8px" }}>Your library is empty</p>
              <p style={{ fontSize: "12px", color: "#555" }}>Click 📚 on any fixture in the Schedule tab to save it here</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
              {library.map(f => (
                <div key={f.libraryId} style={{ background: "#2a2a2a", borderRadius: "10px", overflow: "hidden", border: "1px solid #3a3a3a" }}>
                  <div style={{ width: "100%", height: "140px", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {f.image
                      ? <img src={f.image} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "12px" }} />
                      : <span style={{ fontSize: "36px", opacity: 0.2 }}>💡</span>
                    }
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: "700", fontSize: "13px", color: "#e8e8e8", marginBottom: "3px" }}>{f.name || "Untitled"}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "6px" }}>{f.manufacturer || "—"}{f.type ? ` · ${f.type}` : ""}</div>
                    {f.modelNumber && <div style={{ fontSize: "10px", color: "#555", fontFamily: "monospace", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.modelNumber.split("\n")[0]}</div>}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => {
                        const newF = { ...f, id: idCounter++, libraryId: undefined };
                        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, fixtures: [...p.fixtures, newF] } : p));
                        setViewMode("schedule");
                      }} style={{ flex: 1, background: "#cc0000", color: "#fff", border: "none", borderRadius: "6px", padding: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                        + Add to Project
                      </button>
                      <button onClick={() => setLibrary(prev => prev.filter(l => l.libraryId !== f.libraryId))}
                        style={{ background: "#1a1a1a", color: "#555", border: "1px solid #333", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", cursor: "pointer" }}
                        onMouseEnter={e => e.target.style.color = "#c0504d"} onMouseLeave={e => e.target.style.color = "#555"}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview tab */}
      {viewMode === "overview" && (
        <div style={{ padding: "24px 28px 60px" }}>
          {fixtures.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#ccc" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🖼</div>
              <p>No fixtures yet — add some in the Schedule tab</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {fixtures.map(f => (
                <div key={f.id} style={{ background: "#2a2a2a", borderRadius: "10px", overflow: "hidden", border: "1px solid #3a3a3a" }}>
                  {/* Fixture image */}
                  <div style={{ width: "100%", height: "160px", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {f.image
                      ? <img src={f.image} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "12px" }} />
                      : <span style={{ fontSize: "40px", opacity: 0.2 }}>📷</span>
                    }
                    {/* Cutsheet badge */}
                    <div style={{ position: "absolute", top: "8px", right: "8px" }}>
                      {f.cutsheetPageImages
                        ? <span style={{ background: "#1a4a1a", color: "#6fba6f", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", border: "1px solid #2a6a2a" }}>✓ {f.cutsheetPageImages.length}p</span>
                        : f.cutsheet
                        ? <span style={{ background: "#4a3a00", color: "#f5a623", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", border: "1px solid #6a5a00" }}>⚠ PDF</span>
                        : <span style={{ background: "#2a2a2a", color: "#555", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", border: "1px solid #3a3a3a" }}>no cutsheet</span>
                      }
                    </div>
                    {/* Image badge */}
                    {!f.image && (
                      <div style={{ position: "absolute", bottom: "8px", left: "8px" }}>
                        <span style={{ background: "#3a1a1a", color: "#c0504d", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", border: "1px solid #5a2a2a" }}>no image</span>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: "700", fontSize: "13px", color: "#e8e8e8", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name || "Untitled fixture"}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "6px" }}>{f.manufacturer || "—"} {f.type ? `· ${f.type}` : ""}</div>
                    {f.modelNumber && <div style={{ fontSize: "10px", color: "#555", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.modelNumber.split("\n")[0]}</div>}
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                      {f.wattage && <span style={{ fontSize: "10px", background: "#1a1a1a", color: "#aaa", padding: "2px 6px", borderRadius: "3px" }}>{f.wattage}W</span>}
                      {f.colorTemp && <span style={{ fontSize: "10px", background: "#1a1a1a", color: "#aaa", padding: "2px 6px", borderRadius: "3px" }}>{f.colorTemp}</span>}
                      {f.qty > 1 && <span style={{ fontSize: "10px", background: "#1a1a1a", color: "#aaa", padding: "2px 6px", borderRadius: "3px" }}>×{f.qty}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule view */}
      {viewMode === "schedule" && (<>

      {/* Column headers */}
      {fixtures.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: showPricing ? "48px 2fr 1fr 90px 80px 90px 100px 44px" : "48px 2fr 1fr 90px 80px 44px", padding: "10px 28px 6px", borderBottom: "1px solid #161616" }}>
          {(showPricing ? ["","Fixture / Model","Rep","Wattage","Color Temp","Dist. Net","Total Net",""] : ["","Fixture / Model","Rep","Wattage","Color Temp",""]).map((h,i) => (
            <span key={i} style={{ fontSize: "10px", color: "#e0e0e0", letterSpacing: "0.08em", fontFamily: "monospace", paddingLeft: i===1?"12px":0, fontWeight: "700" }}>{h.toUpperCase()}</span>
          ))}
        </div>
      )}

      {/* Fixture list */}
      <div style={{ padding: "16px 28px 60px" }}>
        {fixtures.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#ccc" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>💡</div>
            <p style={{ margin: "0 0 6px", fontSize: "14px" }}>No fixtures in <strong style={{ color: "#fff" }}>{activeProject.name}</strong></p>
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#bbb" }}>Add fixtures or switch to another project tab</p>
            <button onClick={addFixture} style={addBtnStyle}>+ Add Fixture</button>
          </div>
        )}
        {grouped.map(([mfr, mfrFixtures]) => (
          <div key={mfr} style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#cc0000", letterSpacing: "0.08em", fontWeight: "700" }}>{mfr.toUpperCase()}</span>
              <div style={{ flex: 1, height: "1px", background: "#1c1c1c" }} />
              <span style={{ fontSize: "10px", color: "#aaa", fontFamily: "monospace" }}>{mfrFixtures.length} fixture{mfrFixtures.length!==1?"s":""}</span>
            </div>
            {mfrFixtures.map(f => (
              <FixtureRow key={f.id} fixture={f} onUpdate={updateFixture} onDelete={() => deleteFixture(f.id)}
                isEditing={editingId===f.id} onEditToggle={() => setEditingId(editingId===f.id?null:f.id)}
                manufacturers={manufacturers} reps={reps} onAddManufacturer={addManufacturer} onAddRep={addRep}
                fixtureTypes={fixtureTypes} onAddFixtureType={(t) => setFixtureTypes(prev => prev.includes(t) ? prev : [...prev, t].sort())}
                showPricing={showPricing}
                onSaveToLibrary={() => {
                  const f = fixtures.find(x => x.id === fixture.id);
                  if (!f) return;
                  const entry = { ...f, id: Date.now(), libraryId: Date.now() };
                  setLibrary(prev => {
                    const already = prev.find(l => l.name === f.name && l.modelNumber === f.modelNumber);
                    if (already) return prev.map(l => l.libraryId === already.libraryId ? entry : l);
                    return [...prev, entry];
                  });
                  setSaved(true); setTimeout(() => setSaved(false), 2000);
                }} />
            ))}
          </div>
        ))}
      </div>
    </>)}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "10px", color: "#555", fontFamily: "monospace", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: "700", color }}>{value}</div>
    </div>
  );
}

const inputStyle = { width: "100%", background: "#fff", border: "1px solid #d0d0d0", borderRadius: "7px", padding: "8px 10px", color: "#111", fontSize: "13px", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const labelStyle = { display: "block", fontSize: "10px", color: "#666", letterSpacing: "0.08em", marginBottom: "5px", fontFamily: "monospace", textTransform: "uppercase", fontWeight: "700" };
const addBtnStyle = { background: "#cc0000", color: "#fff", border: "none", borderRadius: "7px", padding: "8px 14px", fontWeight: "700", fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap" };
const miniBtn = (bg, color) => ({ background: bg, color, border: "none", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" });
