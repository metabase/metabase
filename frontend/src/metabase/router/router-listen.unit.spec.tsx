import { useEffect, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route, navigate, subscribeLocation } from "metabase/router";

// `subscribeLocation` fires a callback on every location change and returns an
// unsubscribe function, standing in for v3's `router.listen`.
// `use-dashboard-url-query` relies on it (and crashed the dashboard on v7 when it
// was missing).
function Harness() {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    return subscribeLocation((location) => {
      setSeen((previous) => [...previous, location.pathname]);
    });
  }, []);
  return (
    <div>
      <span data-testid="seen">{seen.join(",")}</span>
      <Outlet />
    </div>
  );
}

const tree = (
  <Route path="/" element={<Harness />}>
    <Route path="other" element={<span data-testid="other">other</span>} />
  </Route>
);

describe("subscribeLocation", () => {
  it("fires the callback on navigation and stops after unsubscribe", async () => {
    renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/",
    });

    await screen.findByTestId("seen");

    navigate("/other");

    await screen.findByText("other");
    expect(screen.getByTestId("seen")).toHaveTextContent("/other");
  });
});
