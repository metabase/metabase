import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";

import { screen } from "__support__/ui";

import type { RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

function NavigateProbe({ api }: { api: RouterApi }) {
  const navigate = api.useNavigate();
  const location = api.useLocation();
  return (
    <div>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-search">{location.search}</span>
      <span data-testid="rr-hash">{location.hash}</span>
      <span data-testid="rr-state">{JSON.stringify(location.state)}</span>
      <button onClick={() => navigate("/foo")}>push</button>
      <button onClick={() => navigate("/bar", { state: { from: "here" } })}>
        push-state
      </button>
      <button onClick={() => navigate({ pathname: "/obj", search: "?x=1" })}>
        push-object
      </button>
      <button onClick={() => navigate("/bar?x=1", { state: { from: "here" } })}>
        push-string-query-state
      </button>
      <button onClick={() => navigate("/baz", { replace: true })}>
        replace
      </button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

// v7's `useNavigate` lists the current pathname in its callback dependencies, so
// the returned `navigate` gets a new identity on every navigation and anything
// depending on it (an effect, or `<Navigate>`) re-runs per navigation. The
// facade matches this, so a `[navigate]` effect runs the same number of times.
function EffectCountProbe({ api }: { api: RouterApi }) {
  const navigate = api.useNavigate();
  const location = api.useLocation();
  const [runs, setRuns] = useState(0);
  useEffect(() => {
    setRuns((count) => count + 1);
  }, [navigate]);
  return (
    <div>
      <span data-testid="rr-effect-runs">{runs}</span>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <button onClick={() => navigate("/next")}>go</button>
    </div>
  );
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("router/useNavigate conformance", () => {
  it("matches v7 when pushing a string destination", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: () => click("push"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/foo");
  });

  it("matches v7 when attaching state to a string destination", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: () => click("push-state"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-state"]).toBe(JSON.stringify({ from: "here" }));
  });

  it("matches v7 when navigating to an object destination", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: () => click("push-object"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/obj");
    expect(facade["rr-search"]).toBe("?x=1");
  });

  it("matches v7 when a string destination carries both a query and state", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: () => click("push-string-query-state"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/bar");
    expect(facade["rr-search"]).toBe("?x=1");
    expect(facade["rr-state"]).toBe(JSON.stringify({ from: "here" }));
  });

  it("matches v7 when replacing then going back", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: async () => {
        await click("push"); // /foo
        await click("replace"); // replaces /foo with /baz
        await click("back"); // back past the replaced entry
      },
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/start");
  });

  it("matches v7 when moving through history with a numeric delta", async () => {
    const { facade, v7 } = await runBoth(NavigateProbe, {
      initialRoute: "/start",
      interact: async () => {
        await click("push"); // /foo
        await click("back"); // navigate(-1)
      },
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/start");
  });

  it("matches v7's navigate identity churn across a navigation", async () => {
    const { facade, v7 } = await runBoth(EffectCountProbe, {
      initialRoute: "/start",
      interact: () => click("go"),
    });
    expect(facade).toEqual(v7);
    // A `[navigate]` effect re-runs on the navigation because the identity
    // changed, on both engines.
    expect(Number(facade["rr-effect-runs"])).toBeGreaterThan(1);
  });
});
