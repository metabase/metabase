import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import { openMenu, setupDashboardSharingMenu } from "./tests/setup";

describe("DashboardSharingMenu", () => {
  it("should have a 'sharing' tooltip by default", () => {
    setupDashboardSharingMenu({
      isAdmin: true,
    });
    expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
      "aria-label",
      "Sharing",
    );
  });

  it("should not appear for archived dashboards", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
      dashboard: { archived: true },
    });

    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  describe("pdf export", () => {
    ["admin", "non-admin"].forEach((userType) => {
      it(`should show the "Export as PDF" menu item for ${userType}`, async () => {
        setupDashboardSharingMenu({ isAdmin: userType === "admin" });
        await openMenu();
        expect(screen.getByText("Export as PDF")).toBeInTheDocument();
      });

      it(`should show the "Export tab as PDF" menu item for ${userType} for a dashboard with multiple tabs`, async () => {
        setupDashboardSharingMenu({
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

    it("should be disabled if dashcards are still loading", async () => {
      setupDashboardSharingMenu({
        dashboardState: {
          loadingDashCards: {
            loadingIds: [],
            loadingStatus: "running",
            startTime: null,
            endTime: null,
          },
        },
      });
      await openMenu();
      expect(screen.getByTestId("dashboard-export-pdf-button")).toBeDisabled();
      expect(screen.getByTestId("dashboard-export-pdf-button")).toHaveStyle({
        cursor: "wait",
      });
    });

    it("should be enabled if dashcards are done loading", async () => {
      setupDashboardSharingMenu({});
      await openMenu();
      expect(screen.getByTestId("dashboard-export-pdf-button")).toBeEnabled();
      expect(screen.getByTestId("dashboard-export-pdf-button")).not.toHaveStyle(
        { cursor: "wait" },
      );
    });
  });

  describe("public links", () => {
    describe("admins", () => {
      it('should show a "Create Public link" menu item if public sharing is enabled', async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Create a public link")).toBeInTheDocument();
      });

      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        setupDashboardSharingMenu({
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

      it("should hide the public link option if public sharing is disabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Public link")).not.toBeInTheDocument();
        expect(screen.queryByText("Enable")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Export as PDF")).toBeInTheDocument();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      // note: if public sharing is disabled, the dashboard object provided by the backend should not have a UUID
    });

    describe("non-admins", () => {
      it('should show a "Copy link" menu item if a public link exists already', async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Copy link")).toBeInTheDocument();
        expect(screen.queryByText("Public link")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Ask your admin to create a public link"),
        ).not.toBeInTheDocument();
      });

      it("should copy the public link directly when clicking 'Copy link'", async () => {
        jest.mocked(navigator.clipboard.writeText).mockClear();
        setupDashboardSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Copy link"));
        await waitFor(() =>
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "http://localhost:3000/public/dashboard/1337bad801",
          ),
        );
      });

      it("should only show the PDF export option when public sharing is disabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: false,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Export as PDF")).toBeInTheDocument();
        expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Ask your admin to create a public link"),
        ).not.toBeInTheDocument();
      });

      it("should only show the PDF export option when there is no existing public link", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
        });
        await openMenu();
        expect(screen.getByText("Export as PDF")).toBeInTheDocument();
        expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Ask your admin to create a public link"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("embedding", () => {
    describe("admins", () => {
      it("should show the 'Embed' menu item if embedding is enabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      it("should show the 'Embed' menu item if embedding is disabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should not show the 'Embed' menu item if embedding is enabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should not show the 'Embed' menu item if embedding is disabled", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });
    });
  });
});
