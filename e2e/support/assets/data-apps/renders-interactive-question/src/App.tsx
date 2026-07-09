import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import {
  DataAppLink,
  DataAppRouter,
  useDataAppLocation,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";
import { type ComponentType, useEffect, useState } from "react";

import { getTestEnv } from "./test-env";

// The sandbox throws host-realm errors, whose `instanceof Error` can be false in
// the guest; read `.message` defensively.
const describeError = (err: unknown): string =>
  (err as { message?: string })?.message ?? String(err);

// A distinctive color used by the isolation probes (green).
const PROBE_COLOR = "rgb(0, 128, 0)";

function Overview() {
  const { scalarQuery, questionQuery } = getTestEnv();
  const ordersCount = useMetabaseQuery(scalarQuery);
  const totalOrders = ordersCount.data?.rawRows?.[0]?.[0];
  const ordersQuery = useMetabaseQueryObject(questionQuery);

  return (
    <div data-testid="data-app-content" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Orders overview</h1>

      <section
        style={{
          padding: 16,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          marginBottom: 24,
          maxWidth: 240,
        }}
      >
        <div
          style={{
            color: "#6b7280",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Total orders
        </div>
        <div
          data-testid="orders-count"
          style={{ fontSize: 32, fontWeight: 700 }}
        >
          {ordersCount.isLoading ? "…" : String(totalOrders ?? "—")}
        </div>
      </section>

      <h2 style={{ margin: "0 0 8px" }}>All orders</h2>
      <div style={{ height: 400 }}>
        {ordersQuery.query ? (
          <InteractiveQuestion card={{ query: ordersQuery.query }} />
        ) : (
          <div>…</div>
        )}
      </div>
    </div>
  );
}

// A nested page reached via the data-app router — used to assert that internal
// navigation is mirrored to the parent's URL bar.
function Details() {
  return (
    <div data-testid="data-app-details" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Order details</h1>
      <p>A nested page reached through the data-app router.</p>
    </div>
  );
}

// Exercises the Near-Membrane sandbox: a blocked DOM API, a fetch to a host that
// is NOT in `allowed_hosts` (rejected), and a fetch to a host that IS in
// `allowed_hosts` (reaches the network). Each outcome is rendered so a test can
// assert it. The sandbox surfaces blocks as a synchronous throw (blocked API)
// or a promise rejection (blocked fetch).
function Sandbox() {
  const { sandbox } = getTestEnv();
  const [blockedApi, setBlockedApi] = useState("pending");
  const [blockedFetch, setBlockedFetch] = useState("pending");
  const [allowedFetch, setAllowedFetch] = useState("pending");

  useEffect(() => {
    try {
      // Plain elements are fine; creating a <script> is blocked by the sandbox.
      document.createElement("script");
      setBlockedApi("ok: created");
    } catch (err) {
      setBlockedApi(`blocked: ${describeError(err)}`);
    }

    if (sandbox) {
      fetch(sandbox.blockedUrl)
        .then((res) => setBlockedFetch(`ok: ${res.status}`))
        .catch((err) => setBlockedFetch(`blocked: ${describeError(err)}`));

      fetch(sandbox.allowedUrl)
        .then((res) => setAllowedFetch(`ok: ${res.status}`))
        .catch((err) => setAllowedFetch(`blocked: ${describeError(err)}`));
    }
  }, [sandbox]);

  return (
    <div data-testid="data-app-sandbox" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Sandbox</h1>
      <div data-testid="blocked-api-result">{blockedApi}</div>
      <div data-testid="blocked-fetch-result">{blockedFetch}</div>
      <div data-testid="allowed-fetch-result">{allowedFetch}</div>
    </div>
  );
}

// Demonstrates that the iframe + Near-Membrane isolate the app from the parent:
//  - CSS: an injected <style> that colors a probe AND `body` only affects the
//    iframe document (the parent's `body` is untouched).
//  - JS: a global set in the app's realm is not visible on the parent window.
function Isolation() {
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

const ROUTES: Record<string, ComponentType> = {
  "/details": Details,
  "/sandboxing": Sandbox,
  "/isolation": Isolation,
};

function Shell() {
  const { pathname } = useDataAppLocation();
  const Page = ROUTES[pathname] ?? Overview;

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <nav
        style={{
          padding: 16,
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          gap: 16,
        }}
      >
        <DataAppLink to="/">Overview</DataAppLink>
        <DataAppLink to="/details">Details</DataAppLink>
        <DataAppLink to="/sandboxing">Sandbox</DataAppLink>
        <DataAppLink to="/isolation">Isolation</DataAppLink>
      </nav>

      <Page />
    </div>
  );
}

export default function App() {
  return (
    <DataAppRouter>
      <Shell />
    </DataAppRouter>
  );
}
