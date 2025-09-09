// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Openlaw } from "openlaw/dist/esm/index.esm.js";
import OpenLawForm from "openlaw-elements";
import clsx from "clsx";

import {
  getClient,
  setClientRoot,
  loginAndRemember,
  getCreatorId,
  getCurrentEmail,
  makeOpenLawIdentity,
} from "./openlawClient";
import { PETITION_TEMPLATE, PETITION_TITLE } from "./petitionTemplate";

/* ---------- helpers ---------- */
// Turn an API root like
//   https://lib.openlaw.io/api/v1/default
// into a web UI root:
//   https://lib.openlaw.io/web/default
function getOpenLawWebBase(apiRootMaybe) {
  const fallback = import.meta.env.VITE_OPENLAW_ROOT || "https://lib.openlaw.io/api/v1/default";
  const apiRoot = String(apiRootMaybe || fallback);
  const m = apiRoot.match(/^(https?:\/\/[^/]+)\/api\/v1\/([^/]+)\/?$/i);
  if (m) {
    const [, origin, workspace] = m;
    return `${origin}/web/${workspace}`;
  }
  // Last resort: if someone passed a plain origin, append /web/default
  try {
    const u = new URL(apiRoot);
    return `${u.origin}/web/default`;
  } catch {
    return "https://lib.openlaw.io/web/default";
  }
}

function absoluteContractUrl(client, contractId) {
  const apiRoot = client?.root?.root || client?.root || import.meta.env.VITE_OPENLAW_ROOT;
  const webBase = getOpenLawWebBase(apiRoot);
  // Primary guess (most common):
  return `${webBase}/contract/${contractId}`;
  // NOTE: If an instance uses a different route, user can land on webBase and search by ID.
  // The webBase exists (see /web/default in official instance). :contentReference[oaicite:0]{index=0}
}

/* ---------- Layout ---------- */
function Shell({ children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-lg">📜 Petition Signer</div>
          <a
            href="https://docs.openlaw.io/api-client/#uploadcontract"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            OpenLaw uploadContract docs
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
        const idx = i + 1;
        const active = step === idx;
        const done = idx < step;
        return (
          <li
            key={label}
            className={clsx(
              "flex items-center gap-2",
              active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"
            )}
          >
            <span
              className={clsx(
                "w-6 h-6 rounded-full grid place-items-center border",
                active
                  ? "bg-blue-50 border-blue-600"
                  : done
                  ? "bg-green-50 border-green-600"
                  : "bg-gray-100 border-gray-300"
              )}
            >
              {done ? "✓" : idx}
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
  const [root, setRootUrl] = useState(
    import.meta.env.VITE_OPENLAW_ROOT || "https://lib.openlaw.io/api/v1/default"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onLogin = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      setClientRoot(root);
      await loginAndRemember(email, password); // APIClient keeps JWT internally
      nav("/fill");
    } catch (e) {
      setErr(e?.message || "Login failed. Check URL / credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Stepper step={1} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h1 className="text-xl font-semibold mb-4">Login to OpenLaw</h1>
        <form onSubmit={onLogin} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">OpenLaw API Root</span>
            <input
              className="input"
              value={root}
              onChange={(e) => setRootUrl(e.target.value)}
              placeholder="https://lib.openlaw.io/api/v1/default"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Email</span>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Password</span>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button disabled={busy} className="btn-primary mt-2">
            {busy ? "Logging in..." : "Login"}
          </button>
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

  useEffect(() => {
    if (errorMessage) console.error("OpenLaw Execution Error:", errorMessage);
  }, [errorMessage]);

  const onChange = (key, value) => setParameters((prev) => ({ ...prev, [key]: value }));

  return (
    <Shell>
      <Stepper step={2} />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-2xl p-6 border">
          <h2 className="text-lg font-semibold mb-2">Petition details</h2>
          <OpenLawForm
            apiClient={client}
            executionResult={exe.executionResult}
            parameters={parameters}
            onChangeFunction={onChange}
            openLaw={Openlaw}
            variables={variables}
            inputProps={{ "*": { className: "input" } }}
          />
          <div className="flex gap-3 mt-4">
            <button className="btn-secondary" onClick={() => nav("/")}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={() => nav("/preview", { state: { parameters } })}
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
            <li>Finally, you’ll open it in OpenLaw to sign.</li>
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

  const { compiledTemplate } = useMemo(() => Openlaw.compileTemplate(PETITION_TEMPLATE), []);
  const exe = useMemo(() => Openlaw.execute(compiledTemplate, {}, params), [compiledTemplate, params]);

  const [html, setHtml] = useState("");

  useEffect(() => {
    const list = Openlaw.getAgreements(exe.executionResult);
    const hiddenVars = [];
    const previewHtml = Openlaw.renderForPreview(list[0].agreement, hiddenVars, {});
    setHtml(previewHtml);
  }, [exe.executionResult]);

  return (
    <Shell>
      <Stepper step={3} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h2 className="text-lg font-semibold mb-3">Preview</h2>
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="flex gap-3 mt-6">
          <button className="btn-secondary" onClick={() => nav("/fill")}>
            Back
          </button>
          <button
            className="btn-primary"
            onClick={() => nav("/create", { state: { parameters: params } })}
          >
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
  const [signUrl, setSignUrl] = useState("");
  const [status, setStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);


  async function checkStatus() {
    try {
      setVerifying(true);
      const s = await client.loadContractStatus(contractId);
      // `s` often includes fields like required signers & who has signed
      setStatus(s);
    } catch (e) {
      setStatus({ error: e?.message || "Could not load status" });
    } finally {
      setVerifying(false);
    }
  }
  useEffect(() => {
    const create = async () => {
      setBusy(true);
      setError("");

      try {
        // Ensure template exists (get or save)
        let templateId;
        try {
          const t = await client.getTemplate(PETITION_TITLE);
          templateId = t?.id;
        } catch {
          const saved = await client.saveTemplate(PETITION_TITLE, PETITION_TEMPLATE);
          templateId = saved?.id;
        }

        // Normalize params to what OpenLaw expects
        const params = { ...formParams };
        if (params["Filing Date"] != null) {
          const d = params["Filing Date"];
          const ms =
            typeof d === "number"
              ? d
              : typeof d === "string" && /^\d+$/.test(d)
              ? Number(d)
              : new Date(d).getTime();
          params["Filing Date"] = String(ms);
        }
        if (typeof params["Allow Public Display"] === "boolean") {
          params["Allow Public Display"] = params["Allow Public Display"] ? "true" : "false";
        }
        // Identity JSON
        const idMaybe = getCreatorId();
        const email = getCurrentEmail();
        const existingIdentity = params["Petitioner Email"];
        const looksJson =
          typeof existingIdentity === "string" &&
          existingIdentity.trim().startsWith("{") &&
          existingIdentity.includes('"email"');
        if (!looksJson) params["Petitioner Email"] = makeOpenLawIdentity(idMaybe, email);

        // Upload
        const creator = idMaybe || email;
        const uploadParams = {
          templateId,
          title: PETITION_TITLE,
          text: PETITION_TEMPLATE,
          creator,
          parameters: params,
          overriddenParagraphs: {},
          agreements: {},
          readonlyEmails: [],
          editEmails: [],
          options: { sendNotification: true },
        };

        const newId = await client.uploadContract(uploadParams);
        setContractId(newId);

        // Build absolute signing URL (no "undefined" ever)
        setSignUrl(absoluteContractUrl(client, newId));
      } catch (e) {
        setError(e?.message || "Failed to create contract.");
      } finally {
        setBusy(false);
      }
    };

    create();
  }, [client, formParams]);

  const openToSign = () => {
    const url = signUrl || absoluteContractUrl(client, contractId);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const webHome = getOpenLawWebBase(client?.root?.root || client?.root);

  return (
    <Shell>
      <Stepper step={4} />
      <div className="bg-white shadow rounded-2xl p-6 border">
        <h2 className="text-lg font-semibold">Create contract</h2>
        {!contractId && !error && <p className="text-gray-700 mt-2">Creating your contract…</p>}
        {error && <p className="text-red-600 mt-2">{error}</p>}
        {contractId && (
          <>
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm text-green-800">Contract created!</div>
              <div className="font-mono text-xs mt-1 break-all">{contractId}</div>
              <div className="text-xs text-gray-700 mt-2">
                Web app:&nbsp;
                <a className="text-blue-600 underline" href={webHome} target="_blank" rel="noreferrer">
                  {webHome}
                </a>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn-secondary" onClick={() => nav("/preview")}>
                Back
              </button>
              <a
                className="btn-primary"
                href={signUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  if (!signUrl) {
                    e.preventDefault();
                    openToSign();
                  }
                }}
              >
                Open in OpenLaw to sign
              </a>
              <button className="btn" onClick={() => client.downloadContractAsPdf(contractId)}>
                Download PDF
              </button>
                <button className="btn" onClick={checkStatus} disabled={verifying}>
                {verifying ? "Checking…" : "Check status"}
              </button>
            </div>
            {status && (
              <pre className="mt-3 text-xs bg-gray-50 p-3 rounded border overflow-auto">
                {JSON.stringify(status, null, 2)}
              </pre>
            )}
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
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/fill" element={<Fill />} />
        <Route path="/preview" element={<PreviewPage />} />
        <Route path="/create" element={<CreateContract />} />
      </Routes>
    </BrowserRouter>
  );
}
