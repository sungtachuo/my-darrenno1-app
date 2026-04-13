import { useState, useRef, useEffect, useCallback } from "react";

const MODEL = "claude-sonnet-4-20250514";
const NOTION_MCP = "https://mcp.notion.com/mcp";
const FIXED_DB_ID = "ec02a75be98544a0a5a05d3f9d967b2b";

// ── Utilities ──────────────────────────────────────────────────────────
function useSheetJS() {
  const [ready, setReady] = useState(!!window.XLSX);
  useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

function fileToBase64(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}
async function callClaude(body) {
  // 1. 這裡不需要 apiKey 了，因為我們已經在 Netlify 後台設定好，
  //    中繼站 (Proxy) 會在伺服器端自動讀取它，這樣最安全！

  // 2. 將網址改為 Netlify Functions 的本地路徑
  const r = await fetch("/.netlify/functions/claude-proxy", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json" 
      // 注意：x-api-key 已經從這裡拿掉了，因為前端不需要知道金鑰
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errorDetail = await r.text();
    throw new Error(`API 連線失敗: ${r.status} - ${errorDetail}`);
  }
  
  return r.json();
}

function getText(data) {
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}

const tsNow = () => new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

// ── Color tokens ──────────────────────────────────────────────────────
const C = {
  headerBg:    "#0F6E56", headerText: "#E1F5EE",
  uploadBg:    "#E1F5EE", uploadBorder: "#1D9E75", uploadDrag: "#9FE1CB", uploadIcon: "#0F6E56",
  chipBlueBg:  "#E6F1FB", chipBlueText:  "#185FA5",
  chipTealBg:  "#E1F5EE", chipTealText:  "#0F6E56",
  chipAmberBg: "#FAEEDA", chipAmberText: "#BA7517",
  chipGrayBg:  "#F1EFE8", chipGrayText:  "#5F5E5A",
  chipPurpBg:  "#EEEDFE", chipPurpText:  "#534AB7",
  statTotalBg: "#E6F1FB", statTotalText: "#0C447C",
  statRowsBg:  "#EAF3DE", statRowsText:  "#3B6D11",
  statImgBg:   "#EEEDFE", statImgText:   "#3C3489",
  successBg:   "#EAF3DE", successBorder: "#639922", successText: "#27500A",
  warnBg:      "#FAEEDA", warnBorder:    "#BA7517", warnText:    "#633806",
  errBg:       "#FCEBEB", errBorder:     "#E24B4A", errText:     "#791F1F",
  histHdr:     "#534AB7", histHdrText:   "#EEEDFE",
  histBand:    "#EEEDFE",
  tblHead:     "#F8F7FF",
  tblBorder:   "#ddd8f8",
  statFailBg:   "#FCEBEB", 
  statFailText: "#E24B4A",
};

// Fixed Notion field set → color mapping
const FIELD_COLORS = {
  "商品名稱": { bg: C.chipBlueBg,  text: C.chipBlueText },
  "產品名稱": { bg: C.chipBlueBg,  text: C.chipBlueText },
  "年期":     { bg: C.chipTealBg,  text: C.chipTealText },
  "保費":     { bg: C.chipAmberBg, text: C.chipAmberText },
  "備註":     { bg: C.chipGrayBg,  text: C.chipGrayText },
};
const fieldColor = (f) => FIELD_COLORS[f] || { bg: C.chipPurpBg, text: C.chipPurpText };

// ── Static option lists ────────────────────────────────────────────────
const INSURERS = [
  "國泰人壽", "富邦人壽", "南山人壽", "新光人壽", "中國人壽",
  "台灣人壽", "三商美邦人壽", "遠雄人壽", "全球人壽", "宏泰人壽",
  "安達人壽", "保誠人壽", "友邦人壽", "第一金人壽", "元大人壽",
  "法國巴黎人壽", "康健人壽", "安聯人壽", "台銀人壽", "合庫人壽",
];

function genYearMonths() {
  const list = [];
  const now = new Date();
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) {
    for (let m = 1; m <= 12; m++) {
      list.push(`${y}/${String(m).padStart(2, "0")}`);
    }
  }
  return list;
}
const YEAR_MONTHS = genYearMonths();
const UNITS = ["元", "千元", "百萬元", "億元"];
const defaultYM = () => {
  const n = new Date();
  return `${n.getFullYear()}/${String(n.getMonth() + 1).padStart(2, "0")}`;
};

// ── Icons ─────────────────────────────────────────────────────────────
const IcoUpload = ({ size = 44, color = C.uploadIcon }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 11.5l4-4 4 4" /><line x1="12" y1="7.5" x2="12" y2="17" />
    <line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);

const IcoOk = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={C.successText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" />
  </svg>
);

const IcoWarn = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={C.warnText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IcoDl = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IcoTable = ({ color = C.uploadIcon }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="9" x2="9" y2="21" />
  </svg>
);

const Spin = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <style>{`@keyframes rsp{to{transform:rotate(360deg)}} .rsp{transform-origin:center;animation:rsp .7s linear infinite}`}</style>
    <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.5"
      strokeDasharray="28 56" strokeLinecap="round" className="rsp" />
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────────
function StatCard({ label, value, bg, color, sub }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 24, fontWeight: 500, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color, opacity: 0.7, marginTop: 6, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color, opacity: 0.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ColBadge({ name }) {
  const c = fieldColor(name);
  return (
    <span style={{ background: c.bg, color: c.text, padding: "3px 10px",
      borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>
      {name}
    </span>
  );
}

// ── MetaBar — three dropdowns ─────────────────────────────────────────
function MetaBar({ insurer, setInsurer, yearMonth, setYearMonth, unit, setUnit, disabled }) {
  const sel = {
    height: 38, padding: "0 32px 0 12px", fontSize: 13, fontWeight: 400,
    border: "1.5px solid var(--color-border-secondary)",
    borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    appearance: "none", WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235F5E5A' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    opacity: disabled ? 0.5 : 1,
    width: "100%",
  };
  const wrap = { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 };
  const lbl = { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)",
    letterSpacing: 0.5, textTransform: "uppercase" };

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "1.5px solid var(--color-border-tertiary)",
      borderRadius: 14, padding: "14px 16px", marginBottom: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)",
        marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        上傳資料標籤（每張截圖套用此設定）
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {/* 保險公司 */}
        <div style={wrap}>
          <div style={lbl}>保險公司</div>
          <select value={insurer} onChange={e => setInsurer(e.target.value)}
            disabled={disabled} style={sel}>
            <option value="">— 選擇公司 —</option>
            {INSURERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* 年份月份 */}
        <div style={wrap}>
          <div style={lbl}>資料年月</div>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
            disabled={disabled} style={sel}>
            {YEAR_MONTHS.map(ym => <option key={ym} value={ym}>{ym}</option>)}
          </select>
        </div>
        {/* 數字單位 */}
        <div style={{ ...wrap, flex: "0 0 110px" }}>
          <div style={lbl}>數字單位</div>
          <select value={unit} onChange={e => setUnit(e.target.value)}
            disabled={disabled} style={sel}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      {/* Active tag strip */}
      {(insurer || yearMonth || unit) && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {insurer && <span style={{ background: C.chipBlueBg, color: C.chipBlueText,
            padding: "2px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500 }}>{insurer}</span>}
          {yearMonth && <span style={{ background: C.chipPurpBg, color: C.chipPurpText,
            padding: "2px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500 }}>{yearMonth}</span>}
          {unit && <span style={{ background: C.chipAmberBg, color: C.chipAmberText,
            padding: "2px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500 }}>{unit}</span>}
        </div>
      )}
    </div>
  );
}
function ProgressBar({ pct, color = C.headerBg }) {
  return (
    <div style={{ width: "100%", height: 6, background: "#e0ede9", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color,
        borderRadius: 3, transition: "width 0.3s ease" }} />
    </div>
  );
}

// ── Extracted data preview table ──────────────────────────────────────
function PreviewTable({ columns, rows, notionMapping }) {
  if (!rows.length) return null;
  const displayCols = columns.slice(0, 6); // cap for display

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${C.tblBorder}`, fontSize: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
          <thead>
            <tr style={{ background: C.tblHead }}>
              {displayCols.map(col => {
                const mapped = notionMapping?.[col];
                const c = fieldColor(mapped || col);
                return (
                  <th key={col} style={{ padding: "8px 12px", textAlign: "left",
                    fontWeight: 500, whiteSpace: "nowrap", borderBottom: `1px solid ${C.tblBorder}` }}>
                    <div style={{ fontSize: 10, color: C.chipGrayText, marginBottom: 3 }}>{col}</div>
                    {mapped && mapped !== col && (
                      <span style={{ background: c.bg, color: c.text, padding: "1px 7px",
                        borderRadius: 4, fontSize: 10, fontWeight: 500 }}>→ {mapped}</span>
                    )}
                  </th>
                );
              })}
              {columns.length > 6 && <th style={{ padding: "8px 10px", color: C.chipGrayText }}>…</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9",
                borderBottom: `0.5px solid ${C.tblBorder}` }}>
                {displayCols.map(col => (
                  <td key={col} style={{ padding: "7px 12px", color: "var(--color-text-primary)",
                    maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={row[col]}>
                    {row[col] || <span style={{ color: "#ccc", fontStyle: "italic" }}>—</span>}
                  </td>
                ))}
                {columns.length > 6 && <td style={{ padding: "7px 10px", color: "#ccc" }}>…</td>}
              </tr>
            ))}
            {rows.length > 8 && (
              <tr>
                <td colSpan={displayCols.length + 1} style={{ padding: "6px 12px",
                  textAlign: "center", color: C.chipGrayText, fontSize: 11,
                  background: C.tblHead }}>
                  還有 {rows.length - 8} 列…（共 {rows.length} 列將全數儲存）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App() {
  const xlsxReady = useSheetJS();
  const [phase, setPhase]     = useState("idle");
  const [progress, setProgress] = useState({ cur: 0, total: 0 });
  const [result, setResult]   = useState(null);
  const [history, setHistory] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [drag, setDrag]       = useState(false);
  // ── Metadata dropdowns ──
  const [insurer,   setInsurer]   = useState("");
  const [yearMonth, setYearMonth] = useState(defaultYM);
  const [unit,      setUnit]      = useState("元");
  const [pendingFile,  setPendingFile]  = useState(null);  // file awaiting confirm
  const [showConfirm,  setShowConfirm]  = useState(false);
  const fileRef = useRef();

  const totalImages = history.length;
  const totalRows   = history.reduce((s, h) => s + (h.saved || 0), 0);

  const processFile = useCallback(async (file) => {
    if (phase !== "idle") return;
    const snapInsurer   = insurer;
    const snapYearMonth = yearMonth;
    const snapUnit      = unit;
    if (!file.type.startsWith("image/")) {
      setResult({ ok: false, msg: "請上傳圖片格式（PNG、JPG、WEBP 等）" });
      return;
    }

    setResult(null);
    setProgress({ cur: 0, total: 0 });

    try {
      // ── Step 1: Analyze table structure + extract all rows ──
      setPhase("analyzing");
      const b64 = await fileToBase64(file);

// --- 替換開始 (原 364-405 行) ---
    // 1. 更換辦公室：改叫 gemini-proxy 接電話
    const analysisResp = await fetch("/.netlify/functions/gemini-proxy", {
      method: "POST",
      body: JSON.stringify({
        prompt: `你是專業的保險商品資料擷取助手。請分析圖片中的表格。
        Notion 資料庫欄位：商品名稱、年期、保費、備註。
        重要：請一律回應純 JSON 格式，不要包含任何 markdown 文字或說明。`,
        image: b64
      })
    });

    const geminiResult = await analysisResp.json();
    
    // 2. 診斷日誌：改用新的結果變數
    console.log("【秘書核心診斷】API 原始回傳物件：", geminiResult);

    let parsed;
    try {
      // 3. 簡化解析：不再需要 replace 和 match，直接讀取深層路徑
      const textContent = geminiResult.candidates[0].content.parts[0].text;
      parsed = JSON.parse(textContent); 
    } catch (e) {
      console.error("解析失敗，AI 原始內容為：", geminiResult);
      throw new Error("AI 無法解析表格結構，請確認圖片清晰度");
    }
    // --- 替換結束 ---
      // ── Step 2: Save in batches of 4 to avoid Notion tool-call limits ──
      setPhase("saving");
      const ts = tsNow();
      const BATCH = 4;
      let savedCount = 0;
      setProgress({ cur: 0, total: rows.length });

      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const startIdx = i;
        const rowsText = chunk.map((r, j) =>
          `第${startIdx + j + 1}筆：商品名稱=${r.商品名稱 || ""}，年期=${r.年期 || ""}，保費=${r.保費 || ""}，保險公司=${snapInsurer}，資料年月=${snapYearMonth}，數字單位=${snapUnit}，上傳時間=${ts}，備註=${r.備註 || ""}`
        ).join("\n");

        await callClaude({
          model: MODEL, max_tokens: 4000,
          messages: [{ role: "user", content:
            `請在 Notion 資料庫 ID "${FIXED_DB_ID}" 中，使用 notion-create-pages 工具依序新增以下 ${chunk.length} 筆記錄，每筆各呼叫一次工具：\n\n` +
            rowsText +
            `\n\n請逐一建立每筆記錄，商品名稱為 title 類型，其餘（年期、保費、保險公司、資料年月、數字單位、上傳時間、備註）均為 rich_text 類型。` }],
          mcp_servers: [{ type: "url", url: NOTION_MCP, name: "notion" }],
        });

        savedCount += chunk.length;
        setProgress({ cur: savedCount, total: rows.length });
      }

      const entry = { fn: file.name, desc, srcCols, mapping, rows, saved: savedCount, ts,
        insurer: snapInsurer, yearMonth: snapYearMonth, unit: snapUnit };
      setHistory(h => [entry, ...h]);
      setResult({ ok: true, entry });

    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setPhase("idle");
    }
  }, [phase, insurer, yearMonth, unit]);

  // Stage a file → show confirm modal
  const stageFile = useCallback((file) => {
    if (phase !== "idle") return;
    if (!file.type.startsWith("image/")) {
      setResult({ ok: false, msg: "請上傳圖片格式（PNG、JPG、WEBP 等）" });
      return;
    }
    setPendingFile(file);
    setShowConfirm(true);
  }, [phase]);

  const handleConfirm = () => {
    setShowConfirm(false);
    if (pendingFile) { processFile(pendingFile); setPendingFile(null); }
  };
  const handleCancel = () => { setShowConfirm(false); setPendingFile(null); };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const d = await callClaude({
        model: MODEL, max_tokens: 4000,
        system: `查詢 Notion 資料庫所有記錄並以純 JSON 陣列回應，不含任何其他文字：[{"商品名稱":"...","年期":"...","保費":"...","保險公司":"...","資料年月":"...","數字單位":"...","上傳時間":"...","備註":"..."}]`,
        messages: [{ role: "user", content:
          `請查詢 Notion 資料庫 ID "${FIXED_DB_ID}" 的全部記錄，以 JSON 陣列回傳，包含商品名稱、年期、保費、保險公司、資料年月、數字單位、上傳時間、備註。` }],
        mcp_servers: [{ type: "url", url: NOTION_MCP, name: "notion" }],
      });
      let records = [];
      const m = getText(d).match(/\[[\s\S]*?\]/);
      if (m) { try { records = JSON.parse(m[0]); } catch {} }
      if (!records.length) {
        records = history.flatMap(h => h.rows.map(r => ({
          商品名稱: r.商品名稱 || "", 年期: r.年期 || "",
          保費: r.保費 || "", 保險公司: h.insurer || "",
          資料年月: h.yearMonth || "", 數字單位: h.unit || "",
          上傳時間: h.ts, 備註: r.備註 || "",
        })));
      }
      if (!records.length) { alert("資料庫中尚無資料可下載"); return; }
      if (!window.XLSX) throw new Error("Excel 套件尚未就緒");
      const ws = window.XLSX.utils.json_to_sheet(records,
        { header: ["商品名稱","年期","保費","保險公司","資料年月","數字單位","上傳時間","備註"] });
      ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 28 }];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "保險商品資料");
      window.XLSX.writeFile(wb, `insurance_data_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { alert(`下載失敗：${e.message}`); }
    finally { setDownloading(false); }
  };

  const isBusy = phase !== "idle";
  const pct = progress.total ? Math.round(progress.cur / progress.total * 100) : 0;

  const phaseLabel = {
    analyzing: "AI 分析表格結構與資料列中...",
    saving:    `儲存至 Notion 資料庫（${progress.cur}/${progress.total} 筆）...`,
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 700, paddingBottom: "1rem" }}>
      <h2 className="sr-only">保險商品資料交流平台</h2>

      {/* ── Header ── */}
      <div style={{
        background: C.headerBg, borderRadius: 16, padding: "20px 24px", marginBottom: 14,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 3, color: C.headerText, opacity: 0.6,
            textTransform: "uppercase", marginBottom: 7 }}>Insurance Exchange Platform</div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#fff" }}>保險商品資料交流平台</div>
          <div style={{ fontSize: 12, color: C.headerText, opacity: 0.65, marginTop: 5,
            display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9FE1CB", display: "inline-block" }} />
            Notion 已連結 · {FIXED_DB_ID.slice(0,8)}…
          </div>
        </div>
        <button onClick={downloadExcel} disabled={downloading || !xlsxReady || isBusy} style={{
          padding: "10px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 10,
          background: "rgba(255,255,255,0.12)", color: "#fff",
          display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
          opacity: (downloading || !xlsxReady || isBusy) ? 0.45 : 1,
        }}>
          {downloading ? <Spin color="#fff" size={14} /> : <IcoDl />}
          {downloading ? "下載中..." : "下載資料庫 Excel"}
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <StatCard label="已上傳圖片" value={totalImages} bg={C.statImgBg}   color={C.statImgText} sub="張" />
        <StatCard label="已儲存筆數" value={totalRows}   bg={C.statRowsBg}  color={C.statRowsText} sub="筆至 Notion" />
        <StatCard label="資料庫"     value="Notion"      bg={C.statTotalBg} color={C.statTotalText} sub={FIXED_DB_ID.slice(0,8)+"…"} />
      </div>

      {/* ── Metadata dropdowns ── */}
      <MetaBar
        insurer={insurer}     setInsurer={setInsurer}
        yearMonth={yearMonth} setYearMonth={setYearMonth}
        unit={unit}           setUnit={setUnit}
        disabled={isBusy}
      />

      {/* ── Upload zone ── */}
      <div
        onDragOver={e => { e.preventDefault(); if (!isBusy) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) stageFile(f); }}
        style={{
          background: drag ? C.uploadDrag : C.uploadBg,
          border: `2px dashed ${drag ? "#085041" : C.uploadBorder}`,
          borderRadius: 16, padding: "2rem 2rem 1.75rem", textAlign: "center",
          opacity: isBusy ? 0.75 : 1,
          transition: "background 0.15s, border-color 0.15s",
          marginBottom: 14, userSelect: "none",
        }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          {isBusy ? <Spin size={40} color={C.uploadIcon} /> : <IcoUpload size={40} />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.uploadIcon, marginBottom: 5 }}>
          {isBusy ? phaseLabel[phase] : "將表格截圖拖曳至此，或點擊下方按鈕選擇檔案"}
        </div>
        <div style={{ fontSize: 13, color: C.uploadIcon, opacity: 0.6, marginBottom: isBusy ? 12 : 16 }}>
          {isBusy
            ? "AI 分析表格格式 → 擷取所有列資料 → 分批存入 Notion"
            : "費率表、商品列表、報價單等任意格式均支援 · 上傳前請確認上方三項設定"}
        </div>
        {/* Confirm-and-upload button */}
        {!isBusy && (
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "10px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer",
              border: "none", borderRadius: 10,
              background: C.headerBg, color: "#fff",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
            <IcoUpload size={16} color="#fff" />
            選擇截圖並確認上傳
          </button>
        )}
        {/* Progress bar during saving */}
        {phase === "saving" && (
          <div style={{ marginTop: 12, padding: "0 1rem" }}>
            <ProgressBar pct={pct} />
            <div style={{ fontSize: 11, color: C.uploadIcon, opacity: 0.55, marginTop: 5 }}>
              {pct}% 完成（{progress.cur} / {progress.total} 筆）
            </div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) stageFile(f); e.target.value = ""; }} />

      {/* ── Result card ── */}
      {result && !isBusy && (
        result.ok ? (
          <div style={{
            background: C.successBg, border: `1.5px solid ${C.successBorder}`,
            borderRadius: 14, padding: "16px 18px", marginBottom: 14,
          }}>
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <IcoOk size={22} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.successText }}>
                  成功儲存 {result.entry.saved} 筆資料至 Notion 資料庫
                </div>
                <div style={{ fontSize: 12, color: C.successText, opacity: 0.75, marginTop: 2 }}>
                  {result.entry.desc}
                </div>
              </div>
            </div>

            {/* Column mapping display */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.successText, opacity: 0.6,
                fontWeight: 500, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>
                欄位對應
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.entry.srcCols.map(col => {
                  const mapped = result.entry.mapping[col];
                  const c = fieldColor(mapped || col);
                  return (
                    <div key={col} style={{ display: "inline-flex", alignItems: "center", gap: 4,
                      background: "rgba(255,255,255,0.6)", borderRadius: 7, padding: "4px 10px",
                      fontSize: 12 }}>
                      <span style={{ color: C.chipGrayText }}>{col}</span>
                      <span style={{ color: "#aaa" }}>→</span>
                      <span style={{ background: c.bg, color: c.text, padding: "1px 7px",
                        borderRadius: 4, fontWeight: 500 }}>{mapped || col}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preview table */}
            <div style={{ fontSize: 11, color: C.successText, opacity: 0.6,
              fontWeight: 500, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>
              資料預覽（前 8 列）
            </div>
            <PreviewTable
              columns={["商品名稱","年期","保費","備註"]}
              rows={result.entry.rows}
              notionMapping={{}}
            />
          </div>
        ) : (
          <div style={{ background: C.errBg, border: `1.5px solid ${C.errBorder}`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 14,
            fontSize: 13, color: C.errText }}>
            上傳失敗：{result.msg}
          </div>
        )
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div style={{ borderRadius: 14, overflow: "hidden", border: `1.5px solid ${C.histHdr}` }}>
          {/* Header */}
          <div style={{ background: C.histHdr, padding: "10px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.histHdrText }}>上傳紀錄</span>
            <span style={{ fontSize: 12, color: C.histHdrText, opacity: 0.65 }}>
              {history.length} 張圖片 · {totalRows} 筆資料
            </span>
          </div>
          {/* Column headers */}
          <div style={{ background: C.histBand, padding: "7px 16px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto",
              gap: 12, paddingBottom: 7, borderBottom: `0.5px solid #cac6e8`,
              fontSize: 11, fontWeight: 500, color: "#3C3489" }}>
              <div>檔案名稱</div><div>表格類型 / 欄位</div>
              <div style={{ textAlign: "center" }}>儲存筆數</div>
              <div style={{ textAlign: "right" }}>時間</div>
            </div>
          </div>
          {/* Rows */}
          {history.map((row, i) => (
            <div key={i} style={{
              background: i % 2 === 0 ? "#fff" : "#faf9ff",
              borderTop: "0.5px solid #ece8f4",
              padding: "10px 16px",
              display: "grid", gridTemplateColumns: "1fr 2fr auto auto",
              gap: 12, alignItems: "start",
            }}>
              {/* Filename */}
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={row.fn}>{row.fn}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  {row.ts}
                </div>
              </div>
              {/* Description + column badges */}
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-primary)", marginBottom: 5 }}>
                  {row.desc}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
                  {row.insurer && <span style={{ background: C.chipBlueBg, color: C.chipBlueText,
                    padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 500 }}>{row.insurer}</span>}
                  {row.yearMonth && <span style={{ background: C.chipPurpBg, color: C.chipPurpText,
                    padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 500 }}>{row.yearMonth}</span>}
                  {row.unit && <span style={{ background: C.chipAmberBg, color: C.chipAmberText,
                    padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 500 }}>{row.unit}</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(row.srcCols || []).slice(0, 4).map(col => (
                    <ColBadge key={col} name={row.mapping?.[col] || col} />
                  ))}
                  {(row.srcCols || []).length > 4 && (
                    <span style={{ fontSize: 11, color: C.chipGrayText, padding: "3px 6px" }}>
                      +{row.srcCols.length - 4}
                    </span>
                  )}
                </div>
              </div>
              {/* Saved count */}
              <div style={{ textAlign: "center" }}>
                <span style={{ background: C.statRowsBg, color: C.statRowsText,
                  padding: "4px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                  {row.saved} 筆
                </span>
              </div>
              {/* Time (already in filename col) */}
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--color-text-secondary)" }}>
                <IcoTable color={C.histHdr} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {history.length === 0 && !result && (
        <div style={{ textAlign: "center", padding: "1.25rem 0",
          color: "var(--color-text-secondary)", fontSize: 13 }}>
          尚無上傳紀錄，上傳第一張表格截圖開始收集資料
        </div>
      )}

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{
            background: "var(--color-background-primary)",
            borderRadius: 18, padding: "26px 26px 22px",
            width: "100%", maxWidth: 420,
            border: "0.5px solid var(--color-border-secondary)",
          }}>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 6 }}>確認上傳設定</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
              請確認以下標籤設定正確，每筆資料將帶入這些資訊儲存至 Notion。
            </div>
            {[
              { label: "保險公司", value: insurer || "（未選擇）", bg: C.chipBlueBg,  color: C.chipBlueText,  warn: !insurer },
              { label: "資料年月", value: yearMonth,               bg: C.chipPurpBg,  color: C.chipPurpText,  warn: false },
              { label: "數字單位", value: unit,                    bg: C.chipAmberBg, color: C.chipAmberText, warn: false },
            ].map(({ label, value, bg, color, warn }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
              }}>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>{label}</span>
                <span style={{
                  background: warn ? C.statFailBg : bg, color: warn ? C.statFailText : color,
                  padding: "4px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {warn && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>}
                  {value}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: "9px 14px",
              background: "var(--color-background-secondary)", borderRadius: 10,
              fontSize: 12, color: "var(--color-text-secondary)",
              display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <IcoUpload size={13} color="var(--color-text-secondary)" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pendingFile?.name}
              </span>
            </div>
            {!insurer && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.statFailText,
                display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                未選擇保險公司，確認後將以空白儲存
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={handleCancel} style={{
                flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 500, cursor: "pointer",
                border: "1.5px solid var(--color-border-secondary)", borderRadius: 10,
                background: "transparent", color: "var(--color-text-secondary)",
              }}>取消，重新設定</button>
              <button onClick={handleConfirm} style={{
                flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 500, cursor: "pointer",
                border: "none", borderRadius: 10, background: C.headerBg, color: "#fff",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                確認，開始上傳
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
