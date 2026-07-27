import {
  InteractiveQuestion,
  StaticQuestion,
  useAction,
} from "@metabase/embedding-sdk-react";
import {
  aggregations,
  breakout,
  copy,
  DataAppLink,
  DataAppRouter,
  filter,
  orderBy,
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

function Details() {
  return (
    <div data-testid="data-app-details" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Order details</h1>
      <p>A nested page reached through the data-app router.</p>
    </div>
  );
}

function QueryStates() {
  const { scalarQuery, errorQuery } = getTestEnv();
  const broken = useMetabaseQuery(errorQuery!);
  const working = useMetabaseQuery(scalarQuery);
  const count = working.data?.rawRows?.[0]?.[0];

  return (
    <div data-testid="data-app-query-states" style={{ padding: 24 }}>
      <h1>Query states</h1>
      <div data-testid="query-error">{broken.error ? "error" : "no-error"}</div>
      <div data-testid="query-loading">
        {working.isLoading ? "loading" : "done"}
      </div>
      <div data-testid="query-value">
        {working.isLoading ? "…" : String(count ?? "—")}
      </div>
      <button
        type="button"
        data-testid="query-refetch"
        onClick={() => {
          working.refetch();
        }}
      >
        refetch
      </button>
    </div>
  );
}

function StaticQuestionPage() {
  const { questionQuery } = getTestEnv();
  const q = useMetabaseQueryObject(questionQuery);

  return (
    <div data-testid="data-app-static-question" style={{ padding: 24 }}>
      <h1>Static question</h1>
      <div style={{ height: 360 }}>
        {q.query ? (
          <StaticQuestion card={{ query: q.query }} />
        ) : (
          <div data-testid="static-question-loading">…</div>
        )}
      </div>
    </div>
  );
}

function Combinators() {
  const combinators = getTestEnv().combinators!;
  const countAgg = aggregations.count();

  const q = useMetabaseQuery({
    source: combinators.source,
    filters: [filter(combinators.filterField, ">", combinators.filterValue)],
    aggregations: [countAgg],
    breakouts: [breakout(combinators.breakoutField)],
    orderBys: [orderBy(countAgg, "desc")],
  });

  return (
    <div data-testid="data-app-combinators" style={{ padding: 24 }}>
      <h1>Combinators</h1>
      <div data-testid="combinators-loading">
        {q.isLoading ? "loading" : "done"}
      </div>
      <div data-testid="combinators-error">
        {q.error ? "error" : "no-error"}
      </div>
      <div data-testid="combinators-rowcount">
        {String(q.data?.rows?.length ?? 0)}
      </div>
    </div>
  );
}

function Actions() {
  const { actionId, actionParams } = getTestEnv();
  const action = useAction(actionId ?? null);
  const [output, setOutput] = useState("idle");

  const onExecute = async () => {
    try {
      const res = await action.execute(actionParams ?? {});
      setOutput(res ? "returned-result" : "returned-null");
    } catch {
      setOutput("threw");
    }
  };

  return (
    <div data-testid="data-app-actions" style={{ padding: 24 }}>
      <h1>Actions</h1>
      <button type="button" data-testid="action-execute" onClick={onExecute}>
        execute
      </button>
      <button
        type="button"
        data-testid="action-reset"
        onClick={() => action.reset()}
      >
        reset
      </button>
      <div data-testid="action-executing">
        {action.isExecuting ? "executing" : "idle"}
      </div>
      <div data-testid="action-result">
        {action.result ? "has-result" : "no-result"}
      </div>
      <div data-testid="action-error">
        {action.error ? "has-error" : "no-error"}
      </div>
      <div data-testid="action-output">{output}</div>
    </div>
  );
}

function Clipboard() {
  const [status, setStatus] = useState("idle");

  const onCopy = async () => {
    try {
      await copy("data-app-clipboard-payload");
      setStatus("copied");
    } catch (err) {
      setStatus(`failed: ${describeError(err)}`);
    }
  };

  return (
    <div data-testid="data-app-clipboard" style={{ padding: 24 }}>
      <h1>Clipboard</h1>
      <button type="button" data-testid="clipboard-copy" onClick={onCopy}>
        copy
      </button>
      <div data-testid="clipboard-status">{status}</div>
    </div>
  );
}

// With no app-supplied `errorComponent`, the host's default neutral error state
// renders here.
function MissingQuestion() {
  return (
    <div
      data-testid="data-app-missing-question"
      style={{ padding: 24, height: 300 }}
    >
      <StaticQuestion questionId={999999999} />
    </div>
  );
}

// Throws during render so the host's BundleErrorBoundary reports the failure to
// the parent, which renders its themed error screen.
function ThrowingPage(): JSX.Element {
  throw new Error("intentional data-app bundle render error");
}

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

function Sandbox() {
  const { sandbox } = getTestEnv();
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

    if (sandbox) {
      fetch(sandbox.blockedUrl)
        .then((res) => setBlockedFetch(`ok: ${res.status}`))
        .catch((err) => setBlockedFetch(`blocked: ${describeError(err)}`));

      fetch(sandbox.allowedUrl)
        .then((res) => setAllowedFetch(`ok: ${res.status}`))
        .catch((err) => setAllowedFetch(`blocked: ${describeError(err)}`));

      if (sandbox.xhrBlockedUrl) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", sandbox.xhrBlockedUrl);
          setBlockedXhr("not blocked");
        } catch (err) {
          setBlockedXhr(`blocked: ${describeError(err)}`);
        }
      }

      if (sandbox.xhrAllowedUrl) {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () => setAllowedXhr(`ok: ${xhr.status}`));
        xhr.addEventListener("error", () => setAllowedXhr("blocked: error"));
        try {
          xhr.open("GET", sandbox.xhrAllowedUrl);
          xhr.send();
        } catch (err) {
          setAllowedXhr(`blocked: ${describeError(err)}`);
        }
      }
    }
  }, [sandbox]);

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
  "/query-states": QueryStates,
  "/static-question": StaticQuestionPage,
  "/combinators": Combinators,
  "/actions": Actions,
  "/clipboard": Clipboard,
  "/missing-question": MissingQuestion,
  "/throw": ThrowingPage,
};

function Shell() {
  const { pathname, navigate } = useDataAppLocation();
  const Page = ROUTES[pathname] ?? Overview;

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <nav
        style={{
          padding: 16,
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <DataAppLink to="/">Overview</DataAppLink>
        <DataAppLink to="/details">Details</DataAppLink>
        <DataAppLink to="/sandboxing">Sandbox</DataAppLink>
        <DataAppLink to="/isolation">Isolation</DataAppLink>
        <button
          type="button"
          data-testid="navigate-to-details"
          onClick={() => navigate("/details")}
        >
          navigate to details
        </button>
      </nav>

      <div data-testid="current-pathname" style={{ padding: "0 16px" }}>
        {pathname}
      </div>

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
