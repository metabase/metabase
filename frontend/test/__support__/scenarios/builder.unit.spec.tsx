import { screen, waitFor } from "@testing-library/react";

import { createScenario } from "./builder";

describe("createScenario", () => {
  it("auto-wires the sample database, a card, and a dashboard", async () => {
    const { dashboard, card, database, render } = createScenario()
      .withDatabase("sample")
      .withCard({ name: "Orders by month" })
      .withDashboard({ tabs: 1 })
      .build();

    expect(database.id).toBeDefined();
    expect(card.name).toBe("Orders by month");
    expect(dashboard.tabs).toHaveLength(1);

    render(<div data-testid="probe">ok</div>);
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toBeInTheDocument();
    });

    // Sanity: the card and dashboard endpoints are now mockable.
    const r = await fetch(`/api/card/${card.id}`);
    expect(r.ok).toBe(true);
    const r2 = await fetch(`/api/dashboard/${dashboard.id}/query_metadata`);
    expect(r2.ok).toBe(true);
  });

  it("seeds settings + token features and the current user", async () => {
    const { render } = createScenario()
      .withAdminUser()
      .withEnterprise({ tokenFeatures: { whitelabel: true } })
      .withSettings({ "site-name": "Custom" })
      .build();

    const { store } = render(<div />);
    const state = store.getState();
    expect(state.currentUser?.is_superuser).toBe(true);
    expect(state.settings.values["site-name"]).toBe("Custom");
    expect(state.settings.values["token-features"]?.whitelabel).toBe(true);
  });

  it("seeds dashboard redux state when asked", async () => {
    const { dashboard, render } = createScenario()
      .withDashboard({ name: "Dash 1" })
      .withDashboardReduxState()
      .build();

    const { store } = render(<div />);
    const state = store.getState();
    expect(state.dashboard.dashboardId).toBe(dashboard.id);
    expect(state.dashboard.dashboards[dashboard.id]).toBeDefined();
  });
});
