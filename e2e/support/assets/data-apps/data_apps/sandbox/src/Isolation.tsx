import { useEffect, useState } from "react";

import { describeError } from "./utils";

const PROBE_COLOR = "rgb(0, 128, 0)";

export function Isolation() {
  const [cssInjected, setCssInjected] = useState("pending");
  const [jsMarker, setJsMarker] = useState("pending");

  useEffect(() => {
    // `createElement("style")` is the one tag the data-app sandbox permits, so
    // apps can style their own sandboxed document.
    try {
      const style = document.createElement("style");
      style.textContent = `.isolation-css-probe { color: ${PROBE_COLOR}; } body { background-color: ${PROBE_COLOR}; }`;
      document.head.appendChild(style);
      setCssInjected("ok");
    } catch (err) {
      setCssInjected(`failed: ${describeError(err)}`);
    }

    try {
      const globals = globalThis as Record<string, unknown>;
      globals.__DATA_APP_ISOLATION_MARKER__ = "in-app";
      setJsMarker(String(globals.__DATA_APP_ISOLATION_MARKER__));
    } catch (err) {
      setJsMarker(`failed: ${describeError(err)}`);
    }
  }, []);

  return (
    <div data-testid="data-app-isolation" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Isolation</h1>
      <div data-testid="css-injected">{cssInjected}</div>
      <div data-testid="isolation-css-probe" className="isolation-css-probe">
        css probe
      </div>
      <div data-testid="js-marker">{jsMarker}</div>
    </div>
  );
}
