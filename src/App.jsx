import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Openlaw } from "openlaw/dist/esm/index.esm.js";
import OpenLawForm from "openlaw-elements";
import clsx from "clsx";
import { verifyMessage } from "ethers";
import {
  getClient,
  setClientRoot,
  loginAndRemember,
  getCreatorId,
  getCurrentEmail,
  makeOpenLawIdentity,
} from "./openlawClient";
import { PETITION_TEMPLATE, PETITION_TITLE } from "./petitionTemplate";
import SignatureBox from "./SignatureBox";

/* ---------- Error Boundary ---------- */
function ErrorBoundary({ children }) {
  const [err, setErr] = useState(null);
  useEffect(() => {
    const onErr = (event) => setErr(event?.error || event?.message || "Unknown error");
    window.addEventListener("error", onErr);
    return () => window.removeEventListener("error", onErr);
  }, []);
  if (err) {
    return (
      <div className="p-4 m-4 border rounded-xl bg-red-50 text-red-800">
        <div className="font-semibold mb-1">Something went wrong in this page.</div>
        <div className="text-xs whitespace-pre-wrap break-words">{String(err)}</div>
      </div>
    );
  }
  return children;
}

/* ---------- helpers ---------- */
function parseApiRoot() {
  return String(import.meta.env.VITE_OPENLAW_ROOT || "https://lib.openlaw.io/api/v1/default");
}
function webBaseFromApiRoot(apiRoot) {
  const m = String(apiRoot).match(/^(https?:\/\/[^/]+)\/api\/v1\/([^/]+)\/?$/i);
  if (m && m.length >= 3) return `${m[1]}/web/${m[2]}`;
  try { const u = new URL(apiRoot); return `${u.origin}/web/default`; } catch { return "https://lib.openlaw.io/web/default"; }
}
function absoluteContractUrl(client, contractId) {
  const rootVal = (client && (client.root?.root || client.root)) || parseApiRoot();
  const webBase = webBaseFromApiRoot(rootVal);
  return `${webBase}/contract/${contractId}`;
}

/* ---------- Layout ---------- */
function Shell({ children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-lg">📜 Petition Signer</div>
          <a
            href="https://docs.openlaw.io/markup-language/"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            OpenLaw Markup Docs
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function Stepper({ step }) {
  const steps = ["Login", "Fill", "Preview", "Create", "Sign"];
  return (
    <ol className="flex gap-2 text-sm mb-6">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const active = step === stepNum;
        const done = stepNum < step;
        return (
          <li key={label} className={clsx("flex items-center gap-2", active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400")}>
            <span className={clsx("w-6 h-6 rounded-full grid place-items-center border",
              active ? "bg-blue-50 border-blue-600" : done ? "bg-green-50 border-green-600" : "bg-gray-100 border-gray-300")}>
              {done ? "✓" : stepNum}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Pages ---------- */
function Login() {
  const nav = useNavigate();
  const [root, setRootUrl] = useState(parseApiRoot());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onLogin = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { setClientRoot(root); await loginAndRemember(email, password); nav("/fill"); }
    catch (e2) { setErr(e2?.message || "Login failed. Check URL / credentials."); }
    finally { setBusy(false); }
  };

  return (
    <Shell>
      <Stepper step={1} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h1 className="text-xl font-semibold mb-4">Login to OpenLaw</h1>
        <form onSubmit={onLogin} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">OpenLaw API Root</span>
            <input className="input" value={root} onChange={(e) => setRootUrl(e.target.value)} placeholder="https://lib.openlaw.io/api/v1/default" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Email</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Password</span>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button disabled={busy} className="btn-primary mt-2">{busy ? "Logging in..." : "Login"}</button>
        </form>
      </div>
    </Shell>
  );
}

function Fill() {
  const nav = useNavigate();
  const client = getClient();

  const { compiledTemplate } = useMemo(() => Openlaw.compileTemplate(PETITION_TEMPLATE), []);
  const exe = useMemo(() => Openlaw.execute(compiledTemplate, {}, {}), [compiledTemplate]);

  const [parameters, setParameters] = useState({});
  const [variables] = useState(() => Openlaw.getExecutedVariables(exe.executionResult, {}));
  const [errorMessage] = useState(exe.errorMessage);
  const [wallet, setWallet] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState(""); // ★ drawn signature

  useEffect(() => { if (errorMessage) console.error("OpenLaw Execution Error:", errorMessage); }, [errorMessage]);

  // prefill identity + email
  useEffect(() => {
    const emailVal = getCurrentEmail();
    const idMaybe = getCreatorId();
    if (emailVal) {
      setParameters((p) => ({ ...p, "Petitioner Email": emailVal }));
      setParameters((p) => ({ ...p, "Petitioner Identity": makeOpenLawIdentity(idMaybe, emailVal) }));
    }
  }, []);

  // whenever user draws, pipe the PNG into the OpenLaw Image parameter
  useEffect(() => {
    if (signatureDataUrl) {
      setParameters((p) => ({ ...p, "Handwritten Signature": signatureDataUrl }));
    } else {
      setParameters((p) => { const { ["Handwritten Signature"]: _, ...rest } = p; return rest; });
    }
  }, [signatureDataUrl]);

  const onChange = (key, value) => setParameters((prev) => ({ ...prev, [key]: value }));

  const connectWallet = async () => {
    if (!window.ethereum) { alert("MetaMask not detected. Please install MetaMask."); return; }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const addr = accounts?.[0];
    if (addr) { setWallet(addr); onChange("Petitioner Wallet", addr); }
  };

  return (
    <Shell>
      <Stepper step={2} />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-2xl p-6 border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Petition details</h2>
            <button className="btn" type="button" onClick={connectWallet}>
              {wallet ? `Wallet: ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect Wallet"}
            </button>
          </div>

          <OpenLawForm
            apiClient={client}
            executionResult={exe.executionResult}
            parameters={parameters}
            onChangeFunction={onChange}
            openLaw={Openlaw}
            variables={variables}
            inputProps={{
              "*": { className: "input" },
              "Petitioner Identity": { style: { display: "none" } },
              // Hide the built-in Image uploader—we fill it from the canvas:
              "Handwritten Signature": { style: { display: "none" } },
            }}
          />

          {/* Drawn signature UI */}
          <div className="mt-5">
            <SignatureBox
              value={signatureDataUrl}
              onChange={setSignatureDataUrl}
              label="Draw your handwritten signature (auto-inserted into the contract)"
            />
          </div>

          <div className="flex gap-3 mt-4">
            <button className="btn-secondary" onClick={() => nav("/")}>Back</button>
            <button
              className="btn-primary"
              onClick={() => nav("/preview", { state: { parameters, wallet, signatureDataUrl } })}
            >
              Preview
            </button>
          </div>
        </div>

        <aside className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border shadow">
          <h3 className="font-semibold">What happens next?</h3>
          <ul className="list-disc ml-6 mt-2 text-sm text-gray-700 space-y-1">
            <li>We’ll render an HTML preview.</li>
            <li>Then we’ll create a contract in OpenLaw.</li>
            <li>Sign here with MetaMask (we’ll verify the real signer address).</li>
          </ul>
        </aside>
      </div>
    </Shell>
  );
}

function PreviewPage() {
  const nav = useNavigate();
  const location = useLocation();
  const params = location.state?.parameters || {};
  const signatureDataUrl = location.state?.signatureDataUrl || "";

  const { compiledTemplate } = useMemo(() => Openlaw.compileTemplate(PETITION_TEMPLATE), []);
  const exe = useMemo(() => Openlaw.execute(compiledTemplate, {}, params), [compiledTemplate, params]);
  const [html, setHtml] = useState("");

  useEffect(() => {
    const list = Openlaw.getAgreements(exe.executionResult);
    const previewHtml = Openlaw.renderForPreview(list[0]?.agreement, [], {});
    setHtml(previewHtml || "<p>(No preview available)</p>");
  }, [exe.executionResult]);

  return (
    <Shell>
      <Stepper step={3} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h2 className="text-lg font-semibold mb-3">Preview</h2>
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />

        {signatureDataUrl && (
          <div className="mt-6">
            <div className="text-sm text-gray-600 mb-1">Drawn signature (will be part of the contract/PDF):</div>
            <div className="border rounded-xl p-3 inline-block bg-white">
              <img src={signatureDataUrl} alt="Drawn signature" style={{ height: 120, display: "block" }} />
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button className="btn-secondary" onClick={() => nav("/fill")}>Back</button>
          <button className="btn-primary" onClick={() => nav("/create", { state: { parameters: params } })}>
            Create contract
          </button>
        </div>
      </div>
    </Shell>
  );
}

function CreateContract() {
  const nav = useNavigate();
  const location = useLocation();
  const client = getClient();
  const formParams = location.state?.parameters || {};

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contractId, setContractId] = useState("");
  const [wallet, setWallet] = useState("");
  const [sig, setSig] = useState("");
  const [activeStep, setActiveStep] = useState(4);
  const [mismatch, setMismatch] = useState(null); // {typed, recovered}

  // Create the contract on mount
  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      setBusy(true); setError("");
      try {
        // ensure template exists
        let templateId;
        try { const t = await client.getTemplate(PETITION_TITLE); templateId = t?.id; }
        catch { const saved = await client.saveTemplate(PETITION_TITLE, PETITION_TEMPLATE); templateId = saved?.id; }

        // normalize params
        const params = { ...formParams };
        if (params["Filing Date"] != null) {
          const d = params["Filing Date"];
          const ms = typeof d === "number" ? d : (typeof d === "string" && /^\d+$/.test(d)) ? Number(d) : new Date(d).getTime();
          params["Filing Date"] = String(ms);
        }
        if (typeof params["Allow Public Display"] === "boolean") {
          params["Allow Public Display"] = params["Allow Public Display"] ? "true" : "false";
        }

        // guarantee identity + email
        const idMaybe = getCreatorId();
        const emailVal = getCurrentEmail();
        if (!params["Petitioner Identity"] && emailVal) params["Petitioner Identity"] = makeOpenLawIdentity(idMaybe, emailVal);
        if (!params["Petitioner Email"] && emailVal) params["Petitioner Email"] = emailVal;

        const creator = idMaybe || emailVal || "unknown@example.com";

        const uploadParams = {
          templateId,
          title: PETITION_TITLE,
          text: PETITION_TEMPLATE,
          creator,
          parameters: params,               // ← includes "Handwritten Signature" (PNG data: URL)
          overriddenParagraphs: {},
          agreements: {},
          readonlyEmails: [],
          editEmails: [],
          options: { sendNotification: true },
        };

        // APIClient returns the new contract ID on success
        const newId = await client.uploadContract(uploadParams);
        if (cancelled) return;
        setContractId(newId || ""); setActiveStep(4);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to create contract.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    create();
    return () => { cancelled = true; };
  }, [client, formParams]);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not detected.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts?.[0]; if (addr) setWallet(addr);
    } catch (e) { alert(e?.message || "Could not connect wallet."); }
  };

  // Sign with MetaMask & verify
  const signWithMetaMask = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not detected.");
      if (!contractId) throw new Error("Contract not created yet.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts?.[0]; if (!addr) throw new Error("No wallet selected.");
      setWallet(addr);

      const message = `${contractId}_sign`;
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, addr] });
      setSig(signature);

      const recovered = verifyMessage(message, signature);
      const typed = formParams["Petitioner Wallet"] || "";
      if (typed && recovered && typed.toLowerCase() !== recovered.toLowerCase()) setMismatch({ typed, recovered });
      else setMismatch(null);

      setActiveStep(5);
      alert("Signed with MetaMask (signature captured in app).");
    } catch (e) {
      alert(e?.message || "MetaMask signing failed.");
    }
  };

  const fixAndRecreate = async () => {
    if (!mismatch?.recovered) return;
    setBusy(true); setError("");
    try {
      const t = await client.getTemplate(PETITION_TITLE);
      const templateId = t?.id;

      const params = { ...formParams, "Petitioner Wallet": mismatch.recovered };
      if (params["Filing Date"] != null) {
        const d = params["Filing Date"];
        const ms = typeof d === "number" ? d : (typeof d === "string" && /^\d+$/.test(d)) ? Number(d) : new Date(d).getTime();
        params["Filing Date"] = String(ms);
      }
      if (typeof params["Allow Public Display"] === "boolean") {
        params["Allow Public Display"] = params["Allow Public Display"] ? "true" : "false";
      }
      const idMaybe = getCreatorId();
      const emailVal = getCurrentEmail();
      if (!params["Petitioner Identity"] && emailVal) params["Petitioner Identity"] = makeOpenLawIdentity(idMaybe, emailVal);
      if (!params["Petitioner Email"] && emailVal) params["Petitioner Email"] = emailVal;

      const creator = idMaybe || emailVal || "unknown@example.com";

      const uploadParams = {
        templateId, title: PETITION_TITLE, text: PETITION_TEMPLATE, creator,
        parameters: params, overriddenParagraphs: {}, agreements: {},
        readonlyEmails: [], editEmails: [], options: { sendNotification: true },
      };

      const newId = await client.uploadContract(uploadParams);
      setContractId(newId || ""); setMismatch(null); setActiveStep(4);
      alert("Contract re-created with the signer’s wallet address.");
    } catch (e) {
      setError(e?.message || "Failed to re-create contract.");
    } finally { setBusy(false); }
  };

  const downloadOpenLawPdf = () => {
    if (!contractId) return alert("No contract yet.");
    try { client.downloadContractAsPdf(contractId); }
    catch (e) { alert(e?.message || "Could not start OpenLaw PDF download."); }
  };

  return (
    <Shell>
      <Stepper step={activeStep} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h2 className="text-lg font-semibold">Create contract</h2>

        {!contractId && !error && <p className="text-gray-700 mt-2">Creating your contract…</p>}
        {error && <p className="text-red-600 mt-2">{error}</p>}

        {contractId && (
          <>
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm text-green-800">Contract created!</div>
              <div className="font-mono text-xs mt-1 break-all">{contractId}</div>
            </div>

            <div className="mt-5 p-4 rounded-lg border bg-white">
              <div className="font-medium mb-2">Actions</div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-primary" onClick={downloadOpenLawPdf}>Download PDF (OpenLaw)</button>
                <button className="btn" onClick={() => client.downloadContractAsDocx(contractId)}>Download DOCX (OpenLaw)</button>
                <a className="btn" href={absoluteContractUrl(client, contractId)} target="_blank" rel="noreferrer">Open in OpenLaw</a>
                <button className="btn" onClick={signWithMetaMask}>Sign with MetaMask (in-app)</button>
              </div>

              {sig && (
                <div className="mt-3">
                  <div className="text-xs text-gray-700">Signature (hex):</div>
                  <pre className="mt-1 text-xs bg-gray-50 p-3 rounded border overflow-auto">{sig}</pre>
                </div>
              )}

              {mismatch && (
                <div className="mt-3 p-3 rounded border border-amber-300 bg-amber-50 text-amber-900">
                  <div className="font-medium">Wallet mismatch detected</div>
                  <div className="text-xs mt-1 break-all">
                    Typed: <span className="font-mono">{mismatch.typed}</span><br />
                    Signed by: <span className="font-mono">{mismatch.recovered}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button className="btn-primary" onClick={fixAndRecreate}>Fix &amp; Re-create with signer address</button>
                    <button className="btn" onClick={() => setMismatch(null)}>Keep as-is</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button className="btn-secondary" onClick={() => nav("/preview")}>Back</button>
              <button className="btn" onClick={connectWallet}>
                {wallet ? `Wallet: ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect Wallet"}
              </button>
            </div>
          </>
        )}

        {busy && <div className="text-xs text-gray-500 mt-4">Please wait…</div>}
      </div>
    </Shell>
  );
}

/* ---------- Router ---------- */
export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/fill" element={<Fill />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/create" element={<CreateContract />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
