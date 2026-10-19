import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockCollection,
  createMockPublicLinkRefusal,
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
    const REFUSED = createMockPublicLinkRefusal({
      id: 10,
      name: "Tenant warehouse",
    });
    const ALLOWED = { refusal: null };

    const routingExplanation =
      /Tenant warehouse has database routing enabled and does not allow anonymous access/;

    it("disables creating a public link when the server refuses one", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        publicLinkRefusal: REFUSED,
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

    it("offers a public link when the server allows one", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        publicLinkRefusal: ALLOWED,
      });
      await openMenu();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });

    it("leaves an existing public link reachable where a new one would be refused", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEnterprise: true,
        hasPublicLink: true,
        publicLinkRefusal: REFUSED,
      });
      await openMenu();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.queryByText(routingExplanation)).not.toBeInTheDocument();
    });
  });
});
