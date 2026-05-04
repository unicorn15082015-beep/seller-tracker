/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";
import QRCode from "qrcode";
import "./styles/main.css";

// TOTP
async function hmacSHA1(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
function base32Decode(s) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    val = (val << 5) | alpha.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function generateTOTP(secret) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter, false);
  const hmac = await hmacSHA1(key, new Uint8Array(buf));
  const offset = hmac[19] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset+1] << 16 | hmac[offset+2] << 8 | hmac[offset+3]) % 1000000;
  return String(code).padStart(6, "0");
}

const ADMIN_UID = "76kdiqnd8sblIMR97u54RIXxZ5C2";
const SHARED_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const isAdmin = (user) => user?.uid === ADMIN_UID;
const fmtVND = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " d";
const fmtUSD = (n) => "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (r) => {
  if (r?.ngay) return new Date(r.ngay + "T00:00:00").toLocaleDateString("vi-VN");
  if (!r?.createdAt) return "";
  const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
  return d.toLocaleDateString("vi-VN");
};
const STATUS_COLORS = { "Pending": "yellow", "Completed": "green", "Issues": "red" };

const Icon = ({ name, size = 16 }) => {
  const icons = {
    plus:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    trash:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
    edit:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    close:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    search:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    link:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  };
  return icons[name] || null;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [otpVerified, setOtpVerified] = useState(false);

  // Check sessionStorage after auth loads
  useEffect(() => {
    if (!authLoading && user) {
      const verified = sessionStorage.getItem("otp_verified_" + user.uid) === "1";
      setOtpVerified(verified);
    }
  }, [authLoading, user]);
  const [orders, setOrders] = useState([]);
  const [teams, setTeams] = useState([]);
  const [forums, setForums] = useState([]);
  const [tab, setTab] = useState("pending");
  const [activeTeam, setActiveTeam] = useState("all");
  const [activeForum, setActiveForum] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [teamModal, setTeamModal] = useState(false);
  const [forumModal, setForumModal] = useState(false);
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u); setAuthLoading(false);
      if (u) {
        const verified = sessionStorage.getItem("otp_verified_" + u.uid) === "1";
        setOtpVerified(verified);
      } else {
        setOtpVerified(false);
      }
    });
    return () => unsub();
  }, []);

  const inMonth = (r) => {
    if (!filterMonth) return true;
    const d = r.ngay ? new Date(r.ngay + "T00:00:00") : (r.createdAt?.toDate ? r.createdAt.toDate() : new Date());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === filterMonth;
  };
  const filteredByMonth = useMemo(() => orders.filter(inMonth), [orders, filterMonth]);
  const filtered = useMemo(() => {
    let rows = filteredByMonth;
    if (tab === "pending")    rows = rows.filter(r => r.trangThai === "Pending");
    else if (tab === "issues")     rows = rows.filter(r => r.trangThai === "Issues");
    else if (tab === "completed")  rows = rows.filter(r => r.trangThai === "Completed");
    if (activeTeam !== "all")  rows = rows.filter(r => r.team === activeTeam);
    if (activeForum !== "all") rows = rows.filter(r => r.forum === activeForum);
    if (search) rows = rows.filter(r => (r.orderId||"").toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [filteredByMonth, tab, activeTeam, activeForum, search]);

  const totalVND = filtered.reduce((s, r) => s + (r.giaNhap||0), 0);
  const totalUSD = filtered.reduce((s, r) => s + (r.giaBan||0), 0);
  const completedCount = filteredByMonth.filter(r => r.trangThai === "Completed").length;
  const pendingCount   = filteredByMonth.filter(r => r.trangThai === "Pending").length;
  const issuesCount    = filteredByMonth.filter(r => r.trangThai === "Issues").length;
  const isAdminUser = isAdmin(user);

  const saveOrder = async (data, id) => {
    if (id) await updateDoc(doc(db, "seller_orders", id), { ...data, updatedAt: serverTimestamp() });
    else    await addDoc(collection(db, "seller_orders"), { ...data, createdAt: serverTimestamp() });
    setModal(null);
  };
  const deleteOrder = async (id) => { if (window.confirm("Xac nhan xoa?")) await deleteDoc(doc(db, "seller_orders", id)); };
  const saveTeam   = async (name) => { await addDoc(collection(db, "seller_teams"),  { name, createdAt: serverTimestamp() }); };
  const deleteTeam  = async (id)  => { if (window.confirm("Xoa team?"))  await deleteDoc(doc(db, "seller_teams", id)); };
  const saveForum  = async (name) => { await addDoc(collection(db, "seller_forums"), { name, createdAt: serverTimestamp() }); };
  const deleteForum = async (id)  => { if (window.confirm("Xoa forum?")) await deleteDoc(doc(db, "seller_forums", id)); };

  const exportCSV = () => {
    const rows = filtered.filter(r => r.trangThai === "Pending");
    if (!rows.length) { alert("Khong co don Pending!"); return; }
    const headers = ["Ngay","ID Don","Gia Nhap VND","Gia Ban USD","Team","Forum","Link","Trang Thai"];
    const data = rows.map(r => [fmtDate(r), r.orderId||"", r.giaNhap||0, r.giaBan||0, r.team||"", r.forum||"", r.link||"", r.trangThai||""]);
    const csv = [headers, ...data].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `pending_${activeTeam}_${activeForum}_${filterMonth||"all"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (authLoading) return <div className="auth-loading">Dang tai...</div>;
  if (!user) return <LoginScreen onOtpVerified={(uid) => { setOtpVerified(true); sessionStorage.setItem("otp_verified_" + uid,"1"); }} />;
  if (!otpVerified) return <LoginScreen onOtpVerified={(uid) => { setOtpVerified(true); sessionStorage.setItem("otp_verified_" + uid,"1"); }} />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand"><span style={{fontSize:18}}>&#x1F6D2;</span><span>SELLER TRACKER</span></div>
        <div className="month-filter">
          <span className="month-label">Thang</span>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="month-input"/>
          <button className="month-all-btn" onClick={() => setFilterMonth("")}>Tat ca</button>
        </div>
        <div className="header-user">
          <span className="user-email">{user.email}</span>
          <button className="btn-icon-sm" onClick={() => setTeamModal(true)}><Icon name="settings" size={14}/></button>
          <button className="btn-icon-sm" onClick={() => setForumModal(true)} style={{width:"auto",padding:"0 8px",fontSize:12}}>Forum</button>
          <button className="btn-logout" onClick={() => { sessionStorage.removeItem("otp_verified_" + user.uid); signOut(auth); }}>Dang xuat</button>
        </div>
      </header>

      <div className="summary-bar">
        <div className="sum-card red"><div className="sum-label">Tong Gia Nhap</div><div className="sum-value">{fmtVND(totalVND)}</div></div>
        <div className="sum-card green"><div className="sum-label">Tong Gia Ban</div><div className="sum-value">{fmtUSD(totalUSD)}</div></div>
        <div className="sum-card blue"><div className="sum-label">Tong Don</div><div className="sum-value">{filtered.length}</div></div>
        <div className="sum-card green"><div className="sum-label">Completed</div><div className="sum-value">{completedCount}</div></div>
        <div className="sum-card yellow"><div className="sum-label">Pending</div><div className="sum-value">{pendingCount}</div></div>
        <div className="sum-card red"><div className="sum-label">Issues</div><div className="sum-value">{issuesCount}</div></div>
      </div>

      <div className="status-tabs">
        <button className={`status-tab yellow ${tab==="pending"?"active":""}`} onClick={() => setTab("pending")}>Pending <span className="tab-count">{pendingCount}</span></button>
        <button className={`status-tab red ${tab==="issues"?"active":""}`} onClick={() => setTab("issues")}>Issues <span className="tab-count">{issuesCount}</span></button>
        {isAdminUser && <button className={`status-tab green ${tab==="completed"?"active":""}`} onClick={() => setTab("completed")}>Completed <span className="tab-count">{completedCount}</span></button>}
      </div>

      <div className="team-tabs">
        <button className={`team-tab ${activeTeam==="all"?"active":""}`} onClick={() => setActiveTeam("all")}>Tat ca</button>
        {teams.map(t => <button key={t.id} className={`team-tab ${activeTeam===t.name?"active":""}`} onClick={() => setActiveTeam(t.name)}>{t.name}</button>)}
      </div>

      {forums.length > 0 && (
        <div className="forum-tabs">
          <span className="forum-label">Forum:</span>
          <button className={`forum-tab ${activeForum==="all"?"active":""}`} onClick={() => setActiveForum("all")}>Tat ca</button>
          {forums.map(f => <button key={f.id} className={`forum-tab ${activeForum===f.name?"active":""}`} onClick={() => setActiveForum(f.name)}>{f.name}</button>)}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={14}/>
          <input placeholder="Tim ID don hang..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button className="clear-search" onClick={() => setSearch("")}>x</button>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-export" onClick={exportCSV}><Icon name="download" size={14}/> Xuat CSV (Pending)</button>
          <button className="btn-add" onClick={() => setModal({data:null})}><Icon name="plus" size={14}/> Them don</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Ngay</th><th>ID Don Hang</th><th>Gia Nhap VND</th><th>Gia Ban USD</th><th>Team</th><th>Forum</th><th>Link</th><th>Trang Thai</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan="9" style={{textAlign:"center",padding:40,color:"var(--text-dim)"}}>Khong co du lieu</td></tr>}
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r)}</td>
                <td><span className="order-id">{r.orderId}</span></td>
                <td className="num red-text">{fmtVND(r.giaNhap)}</td>
                <td className="num green-text">{fmtUSD(r.giaBan)}</td>
                <td><span className="badge blue">{r.team}</span></td>
                <td>{r.forum ? <span className="badge" style={{background:"rgba(139,92,246,0.15)",color:"#a78bfa"}}>{r.forum}</span> : "-"}</td>
                <td>{r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="order-link"><Icon name="link" size={12}/> Link</a> : "-"}</td>
                <td>
                  <select className={`status-select ${STATUS_COLORS[r.trangThai]||"blue"}`} value={r.trangThai}
                    onChange={e => updateDoc(doc(db,"seller_orders",r.id),{trangThai:e.target.value})}>
                    <option value="Pending">Pending</option>
                    <option value="Issues">Issues</option>
                    {isAdminUser && <option value="Completed">Completed</option>}
                  </select>
                </td>
                <td className="actions">
                  <button className="icon-btn" onClick={() => setModal({data:r})}><Icon name="edit" size={13}/></button>
                  {isAdminUser && <button className="icon-btn danger" onClick={() => deleteOrder(r.id)}><Icon name="trash" size={13}/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <OrderModal data={modal.data} teams={teams} forums={forums} onClose={() => setModal(null)} onSave={saveOrder}/>}
      {teamModal && <ListModal title="Quan ly Team" items={teams} onClose={() => setTeamModal(false)} onAdd={saveTeam} onDelete={deleteTeam}/>}
      {forumModal && <ListModal title="Quan ly Forum Ban" items={forums} onClose={() => setForumModal(false)} onAdd={saveForum} onDelete={deleteForum}/>}
    </div>
  );
}

function OrderModal({ data, teams, forums, onClose, onSave }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    ngay:      data?.ngay      || todayStr,
    orderId:   data?.orderId   || "",
    giaNhap:   data?.giaNhap   || "",
    giaBan:    data?.giaBan    || "",
    team:      data?.team      || (teams[0]?.name || ""),
    forum:     data?.forum     || "",
    link:      data?.link      || "",
    trangThai: data?.trangThai || "Pending",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    onSave({ ...form, giaNhap: parseFloat(String(form.giaNhap).replace(/,/g,""))||0, giaBan: parseFloat(String(form.giaBan).replace(/,/g,""))||0 }, data?.id);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{data ? "Sua don hang" : "Them don hang"}</span>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Ngay"><input type="date" value={form.ngay} onChange={e => set("ngay",e.target.value)}/></Field>
            <Field label="ID Don Hang"><input value={form.orderId} onChange={e => set("orderId",e.target.value)} placeholder="ORD-001"/></Field>
            <Field label="Gia Nhap VND"><input type="number" value={form.giaNhap} onChange={e => set("giaNhap",e.target.value)} placeholder="0"/></Field>
            <Field label="Gia Ban USD"><input type="number" step="0.01" value={form.giaBan} onChange={e => set("giaBan",e.target.value)} placeholder="0.00"/></Field>
            <Field label="Team">
              <select value={form.team} onChange={e => set("team",e.target.value)}>
                <option value="">-- Chon Team --</option>
                {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Forum Ban">
              <select value={form.forum} onChange={e => set("forum",e.target.value)}>
                <option value="">-- Chon Forum --</option>
                {forums.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Trang Thai">
              <select value={form.trangThai} onChange={e => set("trangThai",e.target.value)}>
                <option value="Pending">Pending</option>
                <option value="Issues">Issues</option>
              </select>
            </Field>
            <Field label="Link Don Hang"><input value={form.link} onChange={e => set("link",e.target.value)} placeholder="https://..."/></Field>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Huy</button>
          <button className="btn-save" onClick={handleSave}><Icon name="check" size={14}/> Luu</button>
        </div>
      </div>
    </div>
  );
}

function ListModal({ title, items, onClose, onAdd, onDelete }) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{width:360}}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Ten moi..."
              onKeyDown={e => { if(e.key==="Enter"&&newItem.trim()){onAdd(newItem.trim());setNewItem("");}}}
              style={{flex:1,padding:"8px 12px",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text)",fontFamily:"var(--sans)",fontSize:13,outline:"none"}}/>
            <button className="btn-save" onClick={() => {if(newItem.trim()){onAdd(newItem.trim());setNewItem("");}}}><Icon name="plus" size={14}/></button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {items.map(t => (
              <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg3)",borderRadius:7}}>
                <span style={{fontSize:13}}>{t.name}</span>
                <button className="icon-btn danger" onClick={() => onDelete(t.id)}><Icon name="trash" size={13}/></button>
              </div>
            ))}
            {items.length===0 && <div style={{textAlign:"center",color:"var(--text-dim)",fontSize:13,padding:20}}>Chua co du lieu</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field">{label && <label>{label}</label>}{children}</div>;
}

function LoginScreen({ onOtpVerified }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("login");
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tempUser, setTempUser] = useState(null);

  const handleLogin = async () => {
    if (!email || !password) { setError("Vui long nhap day du"); return; }
    setLoading(true); setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const u = cred.user; setTempUser(u);
      const seen = localStorage.getItem("totp_seen_" + u.uid);
      if (seen) {
        setStep("verify");
      } else {
        const otpauth = `otpauth://totp/SellerTracker:${encodeURIComponent(email)}?secret=${SHARED_TOTP_SECRET}&issuer=SellerTracker`;
        const qr = await QRCode.toDataURL(otpauth);
        setQrUrl(qr); setStep("setup");
      }
    } catch(e) { setError("Email hoac mat khau khong dung"); }
    setLoading(false);
  };

  const handleSetup = async () => {
    setError("");
    const expected = await generateTOTP(SHARED_TOTP_SECRET);
    if (otp !== expected) { setError("Ma OTP khong dung"); return; }
    localStorage.setItem("totp_seen_" + tempUser.uid, "1");
    onOtpVerified(tempUser.uid);
  };

  const handleVerify = async () => {
    setError("");
    const expected = await generateTOTP(SHARED_TOTP_SECRET);
    if (otp !== expected) { setError("Ma OTP khong dung"); return; }
    onOtpVerified(tempUser.uid);
  };

  return (
    <div className="login-overlay">
      <div className="login-box">
        <div className="login-logo">
          <span style={{fontSize:32}}>&#x1F6D2;</span>
          <div className="login-title">SELLER TRACKER</div>
          <div className="login-sub">{step==="login"?"Dang nhap de tiep tuc":step==="setup"?"Thiet lap xac thuc 2 buoc":"Nhap ma xac thuc"}</div>
        </div>
        {step==="login" && (
          <div className="login-fields">
            <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
            <div className="field"><label>Mat khau</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="..." onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn-login" onClick={handleLogin} disabled={loading}>{loading?"Dang kiem tra...":"Tiep tuc"}</button>
          </div>
        )}
        {step==="setup" && (
          <div className="login-fields">
            <div className="totp-setup-note">Quet QR bang app <b>Authy</b></div>
            {qrUrl && <img src={qrUrl} alt="QR" className="qr-code"/>}
            <div className="totp-secret-box">Secret: <span>{SHARED_TOTP_SECRET}</span></div>
            <div className="field"><label>Nhap ma 6 so</label><input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} placeholder="000000" onKeyDown={e=>e.key==="Enter"&&handleSetup()}/></div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn-login" onClick={handleSetup}>Xac nhan & Dang nhap</button>
          </div>
        )}
        {step==="verify" && (
          <div className="login-fields">
            <div className="totp-setup-note">Mo app <b>Authy</b> va nhap ma 6 so</div>
            <div className="field"><label>Ma OTP</label><input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} placeholder="000000" autoFocus onKeyDown={e=>e.key==="Enter"&&handleVerify()}/></div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn-login" onClick={handleVerify}>Dang nhap</button>
            <button className="btn-back" onClick={()=>{setStep("login");setError("");setOtp("");}}>Quay lai</button>
          </div>
        )}
      </div>
    </div>
  );
}
