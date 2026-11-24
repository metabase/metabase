import { useEffect, useState } from "react";

import { describeError } from "./utils";

const SANDBOX_ALLOWED_URL = "https://allowed.data-app.test/ping";
const SANDBOX_BLOCKED_URL = "https://blocked.data-app.test/ping";

type Probe = { id: string; run: () => void };

const BLOCKED_PROBES: Probe[] = [
  { id: "script", run: () => document.createElement("script") },
  { id: "window-open", run: () => window.open("https://blocked.test") },
  { id: "alert", run: () => window.alert("x") },
  { id: "history", run: () => window.history.pushState({}, "", "/x") },
  {
    id: "keydown-listener",
    run: () => document.addEventListener("keydown", () => {}),
  },
  { id: "websocket", run: () => new WebSocket("wss://blocked.test") },
  {
    id: "sendbeacon",
    run: () => navigator.sendBeacon("https://blocked.test"),
  },
];

export function Sandbox() {
  const [probeResults, setProbeResults] = useState<Record<string, string>>({});
  const [innerHtml, setInnerHtml] = useState("pending");
  const [blockedFetch, setBlockedFetch] = useState("pending");
  const [allowedFetch, setAllowedFetch] = useState("pending");
  const [blockedXhr, setBlockedXhr] = useState("pending");
  const [allowedXhr, setAllowedXhr] = useState("pending");

  useEffect(() => {
    const results: Record<string, string> = {};
    for (const probe of BLOCKED_PROBES) {
      try {
        probe.run();
        results[probe.id] = "not blocked";
      } catch {
        results[probe.id] = "blocked";
      }
    }
    setProbeResults(results);

    // `innerHTML` is distorted through DOMPurify, which strips <script>.
    try {
      const el = document.createElement("div");
      el.innerHTML = "<script>window.x=1</script><b>ok</b>";
      setInnerHtml(el.querySelector("script") ? "not stripped" : "stripped");
    } catch (err) {
      setInnerHtml(`threw: ${describeError(err)}`);
    }

    fetch(SANDBOX_BLOCKED_URL)
      .then((res) => setBlockedFetch(`ok: ${res.status}`))
      .catch((err) => setBlockedFetch(`blocked: ${describeError(err)}`));

    fetch(SANDBOX_ALLOWED_URL)
      .then((res) => setAllowedFetch(`ok: ${res.status}`))
      .catch((err) => setAllowedFetch(`blocked: ${describeError(err)}`));

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", SANDBOX_BLOCKED_URL);
      setBlockedXhr("not blocked");
    } catch (err) {
      setBlockedXhr(`blocked: ${describeError(err)}`);
    }

    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => setAllowedXhr(`ok: ${xhr.status}`));
    xhr.addEventListener("error", () => setAllowedXhr("blocked: error"));
    try {
      xhr.open("GET", SANDBOX_ALLOWED_URL);
      xhr.send();
    } catch (err) {
      setAllowedXhr(`blocked: ${describeError(err)}`);
    }
  }, []);

  return (
    <div data-testid="data-app-sandbox" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Sandbox</h1>
      {BLOCKED_PROBES.map((probe) => (
        <div key={probe.id} data-testid={`probe-${probe.id}`}>
          {probeResults[probe.id] ?? "pending"}
        </div>
      ))}
      <div data-testid="probe-innerhtml">{innerHtml}</div>
      <div data-testid="blocked-fetch-result">{blockedFetch}</div>
      <div data-testid="allowed-fetch-result">{allowedFetch}</div>
      <div data-testid="blocked-xhr-result">{blockedXhr}</div>
      <div data-testid="allowed-xhr-result">{allowedXhr}</div>
    </div>
  );
}
