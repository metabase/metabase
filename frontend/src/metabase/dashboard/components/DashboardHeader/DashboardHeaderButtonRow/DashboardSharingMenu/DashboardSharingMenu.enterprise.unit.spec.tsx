import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboardCard,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { openMenu, setupDashboardSharingMenu } from "./tests/setup";

describe("DashboardSharingMenu > Enterprise", () => {
  it("should not allow embedding instance analytics dashboard", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
      isPublicSharingEnabled: true,
      isEmbeddingEnabled: true,
      isEnterprise: true,
      dashboard: {
        name: "analysis",
        collection: createMockCollection({
          id: 198,
          name: "Analytics",
          type: "instance-analytics",
        }),
      },
    });
    await openMenu();
    expect(screen.queryByText("Embed")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Public Link")).not.toBeInTheDocument();
  });

  describe("public links on a routed database", () => {
    const ROUTED_DATABASE = createMockDatabase({
      id: 10,
      name: "Tenant warehouse",
      router_user_attribute: "tenant",
      router_anonymous_access_granted: false,
    });
    const GRANTED_DATABASE = createMockDatabase({
      ...ROUTED_DATABASE,
      router_anonymous_access_granted: true,
    });

    const routingExplanation =
      /Tenant warehouse has database routing turned on and does not allow anonymous access/;

    const dashcardsOn = (databaseId: number) => [
      createMockDashboardCard({
        card: createMockCard({ id: 1, database_id: databaseId }),
      }),
    ];

    it("disables creating a public link when one of its cards refuses anonymous access", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        dashboard: { dashcards: dashcardsOn(ROUTED_DATABASE.id) },
        databases: [ROUTED_DATABASE],
      });
      await openMenu();

      expect(await screen.findByText(routingExplanation)).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Create a public link/ }),
      ).toHaveAttribute("data-disabled", "true");
      expect(
        screen.getByRole("link", { name: "Allow anonymous access" }),
      ).toHaveAttribute("href", "/admin/databases/10");

      await userEvent.click(screen.getByText("Create a public link"));
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });

    it("disables creating a public link when only a dashcard series refuses", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        dashboard: {
          dashcards: [
            createMockDashboardCard({
              card: createMockCard({ id: 1, database_id: 2 }),
              series: [
                createMockCard({ id: 2, database_id: ROUTED_DATABASE.id }),
              ],
            }),
          ],
        },
        databases: [ROUTED_DATABASE, createMockDatabase({ id: 2 })],
      });
      await openMenu();

      expect(await screen.findByText(routingExplanation)).toBeInTheDocument();
    });

    it("creates a public link once an admin allows anonymous access", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        dashboard: { dashcards: dashcardsOn(GRANTED_DATABASE.id) },
        databases: [GRANTED_DATABASE],
      });
      await openMenu();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    it("creates a public link on a database that is not routed", async () => {
      const plainDatabase = createMockDatabase({ id: 10, name: "Warehouse" });

      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        dashboard: { dashcards: dashcardsOn(plainDatabase.id) },
        databases: [plainDatabase],
      });
      await openMenu();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    // A link minted before routing was turned on is dead, and the popover is
    // where it gets removed, so the item has to stay reachable.
    it("leaves an existing public link reachable on a routed database", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        hasPublicLink: true,
        dashboard: { dashcards: dashcardsOn(ROUTED_DATABASE.id) },
        databases: [ROUTED_DATABASE],
      });
      await openMenu();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });
  });
});
