import { useRef, useState } from "react";

type EscapeTestEnv = {
  target: string;
  instanceUrl: string;
  payload: Record<string, unknown>;
};

type ReactMode = "react-iframe-about-blank" | "react-iframe-src";

const getEnv = (): EscapeTestEnv => {
  const env = (globalThis as { __METABASE_DATA_APP_TEST_ENV__?: EscapeTestEnv })
    .__METABASE_DATA_APP_TEST_ENV__;

  if (!env) {
    throw new Error("escape fixture: missing test env");
  }

  return env;
};

const describeError = (err: unknown): string =>
  (err as { message?: string })?.message ?? String(err);

async function attemptPrivilegedCall(
  realm: Window,
  target: string,
  payload: unknown,
): Promise<string> {
  const res = await realm.fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return `escaped:${res.status}`;
}

export default function App() {
  const env = getEnv();
  const [result, setResult] = useState("pending");
  const [reactMode, setReactMode] = useState<ReactMode | null>(null);
  const escapedRef = useRef(false);

  const escapeVia = (realm: Window | null | undefined) => {
    if (!realm) {
      setResult("blocked:no-contentWindow");
      return;
    }

    attemptPrivilegedCall(realm, env.target, env.payload)
      .then(setResult)
      .catch((err) => setResult(`blocked:${describeError(err)}`));
  };

  const runCreateElement = () => {
    try {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      escapeVia(iframe.contentWindow);
    } catch (err) {
      setResult(`blocked:${describeError(err)}`);
    }
  };

  return (
    <div data-testid="data-app-escape" style={{ padding: 24 }}>
      <h1>Escape probe</h1>
      <div data-testid="escape-result">{result}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button data-testid="escape-create-element" onClick={runCreateElement}>
          document.createElement about:blank
        </button>
        <button
          data-testid="escape-react-about-blank"
          onClick={() => setReactMode("react-iframe-about-blank")}
        >
          React iframe about:blank
        </button>
        <button
          data-testid="escape-react-src"
          onClick={() => setReactMode("react-iframe-src")}
        >
          React iframe src
        </button>
      </div>

      {reactMode === "react-iframe-about-blank" && (
        <iframe
          title="escape-target"
          ref={(element) => {
            if (element && !escapedRef.current) {
              escapedRef.current = true;
              escapeVia(element.contentWindow);
            }
          }}
          style={{ display: "none" }}
        />
      )}
      {reactMode === "react-iframe-src" && (
        <iframe
          title="escape-target"
          src={`${env.instanceUrl}/`}
          onLoad={(e) => escapeVia(e.currentTarget.contentWindow)}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
