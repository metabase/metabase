import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const tokenFeatures = {
  cache_granular_controls: true,
  audit_app: true,
};

describe("DashboardSettingsSidebar > premium enterprise", () => {
  it("should render the component", async () => {
    await setup({
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    expect(screen.getByText("Dashboard settings")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should render caching section with caching feature", async () => {
    await setup({
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    expect(await screen.findByText("Caching")).toBeInTheDocument();
    expect(
      await screen.findByText("When to get new results"),
    ).toBeInTheDocument();
  });

  it("should show cache form when clicking on caching section", async () => {
    await setup({
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    await userEvent.click(await screen.findByText("Use default"));

    expect(await screen.findByText("Caching settings")).toBeInTheDocument();
  });

  it("should render caching section when can_set_cache_policy is true but can_write is false", async () => {
    await setup({
      dashboard: createMockDashboard({
        can_write: false,
        can_set_cache_policy: true,
      }),
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    expect(await screen.findByText("Caching")).toBeInTheDocument();
  });

  it("should not render caching section when can_set_cache_policy is false", async () => {
    await setup({
      dashboard: createMockDashboard({
        can_write: true,
        can_set_cache_policy: false,
      }),
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    expect(screen.queryByText("Caching")).not.toBeInTheDocument();
  });

  it("should hide history for instance analytics dashboard", async () => {
    await setup({
      dashboard: createMockDashboard({
        collection: createMockCollection({ type: "instance-analytics" }),
      }),
      settings: createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
      enterprisePlugins: ["audit_app", "caching"],
    });

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });
});
