import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const setupWithLibrary = ({
  dashboard,
  isAdmin,
}: {
  dashboard: typeof LIBRARY_DASHBOARD;
  isAdmin: boolean;
}) =>
  setup({
    dashboard,
    collections: [LIBRARY_COLLECTION],
    isAdmin,
    tokenFeatures: { library: true },
    enterprisePlugins: ["library"],
  });

async function openDashboardMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Move, trash, and more…" }),
  );
  return within(await screen.findByRole("menu")).getAllByRole("menuitem");
}

const setupEnterprise = (opts: any) => {
  return setup({
    ...opts,
    tokenFeatures: { audit_app: true },
    enterprisePlugins: ["audit_app", "database_routing", "collections"],
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

const LIBRARY_COLLECTION = createMockCollection({
  name: "Dashboards",
  id: 20,
  type: "library-dashboards",
});

const LIBRARY_DASHBOARD = createMockDashboard({
  name: "Library Dashboard",
  id: 4,
  collection_id: LIBRARY_COLLECTION.id,
  collection: LIBRARY_COLLECTION,
  can_write: true,
});

const REGULAR_DASHBOARD = createMockDashboard({
  name: "Regular Dashboard",
  id: 5,
  can_write: true,
});

describe("DashboardHeader - enterprise", () => {
  it("should render the correct buttons for instance analytics dashboard", async () => {
    await setupEnterprise({
      dashboard: INSTANCE_ANALYTICS_DASHBOARD,
      collections: [INSTANCE_ANALYTICS_COLLECTION],
    });

    // Expect heading element to be present with correct role and aria-level (#70544)
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /Analytics Dashboard/,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /audit/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Make a copy")).toBeInTheDocument();

    // Other buttons
    expect(
      screen.getByRole("button", { name: /bookmark/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fullscreen/i }),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText("Edit dashboard")).not.toBeInTheDocument();
  });
});

describe("DashboardHeader - library dashboard", () => {
  it("should hide Edit and offer View in Data Studio first in the menu", async () => {
    await setupWithLibrary({ dashboard: LIBRARY_DASHBOARD, isAdmin: true });

    expect(
      await screen.findByRole("button", { name: "Move, trash, and more…" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit dashboard")).not.toBeInTheDocument();

    const [firstItem] = await openDashboardMenu();
    expect(firstItem).toHaveTextContent("View in Data Studio");
    expect(firstItem).toHaveAttribute(
      "href",
      `/data-studio/dashboards/${LIBRARY_DASHBOARD.id}`,
    );
  });

  it("should hide Edit and View in Data Studio for a user without Data Studio access", async () => {
    await setupWithLibrary({ dashboard: LIBRARY_DASHBOARD, isAdmin: false });

    expect(
      await screen.findByRole("button", { name: "Move, trash, and more…" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit dashboard")).not.toBeInTheDocument();

    const [firstItem] = await openDashboardMenu();
    expect(firstItem).not.toHaveTextContent("View in Data Studio");
  });

  it("should keep Edit and no View in Data Studio for a dashboard outside the Library", async () => {
    await setupWithLibrary({ dashboard: REGULAR_DASHBOARD, isAdmin: true });

    expect(await screen.findByLabelText("Edit dashboard")).toBeInTheDocument();

    const [firstItem] = await openDashboardMenu();
    expect(firstItem).not.toHaveTextContent("View in Data Studio");
  });
});
