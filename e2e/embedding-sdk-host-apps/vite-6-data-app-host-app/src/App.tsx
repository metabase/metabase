import { StaticQuestion } from "@metabase/embedding-sdk-react";
import {
  defineQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";
import { useEffect } from "react";

const ORDERS_TABLE_ID = 5;

const OrdersQuery = defineQuery({
  source: { type: "table", id: ORDERS_TABLE_ID },
});

const ALLOWED_URL = "https://allowed.data-app.test/ping";
const BLOCKED_URL = "https://blocked.data-app.test/ping";

// The dev React build re-invokes effects (StrictMode) and the SDK remounts the
// app once while its store initializes, so an unguarded probe fires these
// requests a non-deterministic number of times and the diagnostics counts drift
// between runs. Fire exactly once per page load (the flag resets on reload) so
// the blocked-request assertions are stable.
let hasProbed = false;

function SandboxProbe() {
  useEffect(() => {
    if (hasProbed) {
      return;
    }
    hasProbed = true;
    fetch(ALLOWED_URL).catch(() => {});
    fetch(BLOCKED_URL).catch(() => {});
  }, []);

  return null;
}

export default function App() {
  const { query } = useMetabaseQueryObject(OrdersQuery);

  return (
    <div data-testid="dev-app-content" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Vite 6 data app</h1>

      <div data-testid="dev-app-question" style={{ height: 400 }}>
        {query ? (
          <StaticQuestion card={{ query }} />
        ) : (
          <div data-testid="dev-app-loading">…</div>
        )}
      </div>

      <SandboxProbe />

      <button
        data-testid="dev-app-error-probe"
        onClick={() => console.error("dev-app probe error")}
      >
        Probe error
      </button>
    </div>
  );
}
