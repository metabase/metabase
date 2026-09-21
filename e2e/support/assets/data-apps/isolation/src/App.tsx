import { useRef, useState } from "react";

import { createProbes } from "./probes";
import {
  REACT_PROBES,
  ReactProbeHost,
  useProbeCustomElement,
} from "./ReactProbes";
import type { ReactMode } from "./types";
import { describeError, getEnv } from "./utils";

// A data app that, from inside the sandbox, probes each way a bundle might reach
// across the isolation boundary and reports the first sign of the outcome:
// `isolated:` (held) or `reached:` (crossed). The spec asserts every probe
// reports `isolated:`.
export default function App() {
  const env = getEnv();
  const [result, setResult] = useState("pending");
  const [reactMode, setReactMode] = useState<ReactMode | null>(null);
  const firedRef = useRef(false);

  useProbeCustomElement(setResult);

  // If a probe never reports, `no-probe-observed` fails the spec (the probe
  // never fired) rather than hanging.
  const arm = () =>
    window.setTimeout(
      () => setResult((r) => (r === "pending" ? "no-probe-observed" : r)),
      20000,
    );

  const fire = (run: () => void) => {
    arm();

    try {
      run();
    } catch (err) {
      setResult(`isolated:${describeError(err)}`);
    }
  };

  const probes = createProbes(env, setResult);

  return (
    <div data-testid="data-app-isolation" style={{ padding: 24 }}>
      <h1>Isolation probe</h1>
      <div data-testid="isolation-result">{result}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {probes.map((probe) => (
          <button
            key={probe.id}
            data-testid={`isolation-${probe.id}`}
            onClick={() => fire(probe.run)}
          >
            {probe.label}
          </button>
        ))}
        {REACT_PROBES.map((probe) => (
          <button
            key={probe.id}
            data-testid={`isolation-${probe.id}`}
            onClick={() => {
              arm();
              firedRef.current = false;
              setReactMode(probe.mode);
            }}
          >
            {probe.label}
          </button>
        ))}
      </div>

      <ReactProbeHost
        mode={reactMode}
        env={env}
        report={setResult}
        firedRef={firedRef}
      />
    </div>
  );
}
