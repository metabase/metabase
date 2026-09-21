import { useRef, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { Location } from "metabase/router";
import { Route, useLocation } from "metabase/router";

import { useLocationSync } from "./use-location-sync";

function TestDashboard() {
  // The hook takes the legacy compat `Location`, which adds `query` and `action`
  // on top of what `useLocation` returns. It only reads `hash`, so the narrower
  // location stands in for the route prop the dashboard passes.
  const location = useLocation() as Location;
  const renderCount = useRef(0);
  renderCount.current += 1;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshPeriod, setRefreshPeriod] = useState<number | null>(null);

  useLocationSync<boolean>({
    key: "fullscreen",
    value: isFullscreen,
    onChange: (value) => setIsFullscreen(value ?? false),
    location,
  });

  useLocationSync<number | null>({
    key: "refresh",
    value: refreshPeriod,
    onChange: setRefreshPeriod,
    location,
  });

  return (
    <div>
      <span data-testid="render-count">{renderCount.current}</span>
      <span data-testid="url">{`${location.pathname}${location.hash}`}</span>
      <span data-testid="fullscreen">{String(isFullscreen)}</span>
    </div>
  );
}

const setup = (initialRoute: string) =>
  renderWithProviders(
    <Route path="/dashboard/1" element={<TestDashboard />} />,
    {
      withRouter: true,
      initialRoute,
    },
  );

describe("useLocationSync", () => {
  it("settles instead of looping replaces when the url already matches", async () => {
    setup("/dashboard/1");

    expect(await screen.findByTestId("url")).toHaveTextContent("/dashboard/1");
    expect(Number(screen.getByTestId("render-count").textContent)).toBeLessThan(
      10,
    );
  });

  it("settles when the hash carries a non-default value", async () => {
    setup("/dashboard/1#fullscreen=true");

    expect(await screen.findByTestId("fullscreen")).toHaveTextContent("true");
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/dashboard/1#fullscreen",
    );
    expect(Number(screen.getByTestId("render-count").textContent)).toBeLessThan(
      10,
    );
  });
});
