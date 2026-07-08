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
        <div data-testid="orders-count" style={{ fontSize: 32, fontWeight: 700 }}>
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
// or a promise rejection (blocked fetch); the thrown value may not be an
// instance of the guest realm's `Error`, so read `.message` defensively.
function Sandbox() {
  const { sandbox } = getTestEnv();
  const [blockedApi, setBlockedApi] = useState("pending");
  const [blockedFetch, setBlockedFetch] = useState("pending");
  const [allowedFetch, setAllowedFetch] = useState("pending");

  useEffect(() => {
    const describe = (err: unknown) =>
      (err as { message?: string })?.message ?? String(err);

    try {
      // Plain elements are fine; creating a <script> is blocked by the sandbox.
      document.createElement("script");
      setBlockedApi("ok: created");
    } catch (err) {
      setBlockedApi(`blocked: ${describe(err)}`);
    }

    if (sandbox) {
      fetch(sandbox.blockedUrl)
        .then((res) => setBlockedFetch(`ok: ${res.status}`))
        .catch((err) => setBlockedFetch(`blocked: ${describe(err)}`));

      fetch(sandbox.allowedUrl)
        .then((res) => setAllowedFetch(`ok: ${res.status}`))
        .catch((err) => setAllowedFetch(`blocked: ${describe(err)}`));
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

const ROUTES: Record<string, ComponentType> = {
  "/details": Details,
  "/sandboxing": Sandbox,
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
