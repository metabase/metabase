import { screen } from "@testing-library/react";

import {
  createMockDashboard,
  createMockCollection,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const setupEnterprise = (opts: any) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: { audit_app: true },
  });
};

const INSTANCE_ANALYTICS_DASHBOARD = createMockDashboard({
  name: "Analytics Dashboard",
  id: 3,
  collection_id: 10,
  can_write: false,
});

const INSTANCE_ANALYTICS_COLLECTION = createMockCollection({
  name: "Custom Reports",
  id: 10,
  type: "instance-analytics",
  can_write: false,
});

describe("DashboardHeader - enterprise", () => {
  it("should render the correct buttons for instance analytics dashboard", async () => {
    await setupEnterprise({
      dashboard: INSTANCE_ANALYTICS_DASHBOARD,
      collections: [INSTANCE_ANALYTICS_COLLECTION],
    });
    expect(
      await screen.findByRole("img", { name: /audit/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Make a copy")).toBeInTheDocument();

    //Other buttons
    expect(
      screen.getByRole("button", { name: /bookmark/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fullscreen/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /edit dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
