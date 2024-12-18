import { screen } from "__support__/ui";

import { openMenu, setup } from "./setup";

describe("DashboardActionMenu", () => {
  describe("pdf export", () => {
    ["admin", "non-admin"].forEach(userType => {
      it(`should show the "Export as PDF" menu item for ${userType}`, async () => {
        setup({ isAdmin: userType === "admin" });
        await openMenu();
        expect(screen.getByText("Export as PDF")).toBeInTheDocument();
      });

      it(`should show the "Export tab as PDF" menu item for ${userType} for a dashboard with multiple tabs`, async () => {
        setup({
          isAdmin: userType === "admin",
          dashboard: {
            tabs: [
              { id: 1, name: "First Tab" },
              { id: 2, name: "Second Tab" },
            ] as any,
          },
        });
        await openMenu();
        expect(screen.getByText("Export tab as PDF")).toBeInTheDocument();
      });
    });
  });

  describe("public links", () => {
    describe("admins", () => {
      it('should show a "Create Public link" menu item if public sharing is enabled', async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Create a public link")).toBeInTheDocument();
      });

      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      it("should show a 'public links are off' menu item if public sharing is disabled", async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Public links are off")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      // note: if public sharing is disabled, the dashboard object provided by the backend should not have a UUID
    });

    describe("non-admins", () => {
      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        setup({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      it("should not show a 'ask your admin to create a public link' menu item if public sharing is disabled", async () => {
        setup({
          isAdmin: false,
          isPublicSharingEnabled: false,
          hasPublicLink: true,
        });
        await openMenu();
        expect(
          screen.getByText("Ask your admin to create a public link"),
        ).toBeInTheDocument();
      });

      it("should show a 'ask your admin to create a public link' menu item if public sharing is enabled, but there is no existing public link", async () => {
        setup({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
        });
        await openMenu();
        expect(
          screen.getByText("Ask your admin to create a public link"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("embedding", () => {
    describe("admins", () => {
      it("should show the 'Embed' menu item if embedding is enabled", async () => {
        setup({
          isAdmin: true,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      it("should show the 'Embed' menu item if embedding is disabled", async () => {
        setup({
          isAdmin: true,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should not show the 'Embed' menu item if embedding is enabled", async () => {
        setup({
          isAdmin: false,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should not show the 'Embed' menu item if embedding is disabled", async () => {
        setup({
          isAdmin: false,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });
    });
  });
});
