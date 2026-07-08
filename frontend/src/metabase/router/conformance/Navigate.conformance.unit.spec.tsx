import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { screen } from "__support__/ui";

import type { Probe, RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

// Because the facade churns its `navigate` identity like v7, a mounted
// <Navigate> re-fires whenever the pathname changes and snaps forward to its
// target again. So on both engines, going back re-asserts the destination.
function makeLandingProbe(to: string, replace: boolean): Probe {
  return function LandingProbe({ api }: { api: RouterApi }) {
    const { Navigate } = api;
    const navigate = api.useNavigate();
    const location = api.useLocation();
    return (
      <div>
        <span data-testid="rr-pathname">{location.pathname}</span>
        <Navigate to={to} replace={replace} />
        <button onClick={() => navigate(-1)}>back</button>
      </div>
    );
  };
}

function RenavigateProbe({ api }: { api: RouterApi }) {
  const { Navigate } = api;
  const location = api.useLocation();
  const [to, setTo] = useState("/first");
  return (
    <div>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <Navigate to={to} />
      <button onClick={() => setTo("/second")}>change</button>
    </div>
  );
}

const RICH_STATE = { when: new Date(0), n: NaN };

function StateProbe({ api }: { api: RouterApi }) {
  const { Navigate } = api;
  const location = api.useLocation();
  const state = location.state as typeof RICH_STATE | null;
  return (
    <div>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-when-is-date">
        {String(state?.when instanceof Date)}
      </span>
      <span data-testid="rr-n-is-nan">{String(Number.isNaN(state?.n))}</span>
      <Navigate to="/dest" state={RICH_STATE} />
    </div>
  );
}

describe("router/Navigate conformance", () => {
  it("matches v7 when landing on the destination on mount (push)", async () => {
    const { facade, v7 } = await runBoth(makeLandingProbe("/dest", false), {
      initialRoute: "/home",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/dest");
  });

  it("matches v7 when landing on the destination on mount (replace)", async () => {
    const { facade, v7 } = await runBoth(makeLandingProbe("/dest", true), {
      initialRoute: "/home",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/dest");
  });

  it("matches v7 when re-asserting the pushed target on back", async () => {
    const { facade, v7 } = await runBoth(makeLandingProbe("/dest", false), {
      initialRoute: "/home",
      interact: () =>
        userEvent.click(screen.getByRole("button", { name: "back" })),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/dest");
  });

  it("matches v7 when re-navigating after the target prop changes", async () => {
    const { facade, v7 } = await runBoth(RenavigateProbe, {
      initialRoute: "/home",
      interact: () =>
        userEvent.click(screen.getByRole("button", { name: "change" })),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/second");
  });

  it("matches v7 when passing rich state through by reference", async () => {
    const { facade, v7 } = await runBoth(StateProbe, {
      initialRoute: "/home",
    });
    expect(facade).toEqual(v7);
    // Serializing would turn the Date into a string and NaN into null.
    expect(facade["rr-when-is-date"]).toBe("true");
    expect(facade["rr-n-is-nan"]).toBe("true");
  });
});
