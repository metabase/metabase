import userEvent from "@testing-library/user-event";

import {
  setupGdriveGetFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
} from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

function setupPremiumDWH(opts: SetupOpts) {
  setupGdriveServiceAccountEndpoint();
  setupGdriveGetFolderEndpoint({ status: "not-connected" });
  return setup({
    hasEnterprisePlugins: true,
    hasDWHAttached: true,
    ...opts,
  });
}

describe("nav > containers > MainNavbar (EE with token)", () => {
  describe("DWH Upload", () => {
    const uploadSection = () => screen.getByTestId("dwh-upload");

    it("should render DWH Upload section to admins", async () => {
      await setupPremiumDWH({
        user: createMockUser({ is_superuser: true }),
      });
      expect(uploadSection()).toBeInTheDocument();
    });

    it("should render 'upload CSV' menu item to admins", async () => {
      await setupPremiumDWH({
        user: createMockUser({ is_superuser: true }),
      });

      await userEvent.click(within(uploadSection()).getByText("Add Data"));
      expect(await screen.findByText("Upload CSV")).toBeInTheDocument();
    });

    it("should render gsheets upload menu item to admins", async () => {
      await setupPremiumDWH({
        user: createMockUser({ is_superuser: true }),
      });
      await userEvent.click(within(uploadSection()).getByText("Add Data"));
      expect(
        await screen.findByText("Connect Google Sheets"),
      ).toBeInTheDocument();
    });

    it("should render 'upload CSV' button to regular users who have sufficient permissions", async () => {
      await setupPremiumDWH({
        canCurateRootCollection: true,
        isUploadEnabled: true,
        user: createMockUser({ is_superuser: false }),
      });
      await userEvent.click(within(uploadSection()).getByText("Add Data"));
      expect(await screen.findByText("Upload CSV")).toBeInTheDocument();
    });

    it("should not render DWH Upload section to regular users who lack root collection permissions", async () => {
      await setupPremiumDWH({
        canCurateRootCollection: false,
        isUploadEnabled: true,
        user: createMockUser({ is_superuser: false }),
      });

      expect(screen.queryByTestId("dwh-upload")).not.toBeInTheDocument();
    });

    it("should not render DWH Upload section to regular users who lack data access permissions", async () => {
      await setupPremiumDWH({
        canCurateRootCollection: true,
        hasDataAccess: false,
        isUploadEnabled: true,
        user: createMockUser({ is_superuser: false }),
      });

      expect(screen.queryByTestId("dwh-upload")).not.toBeInTheDocument();
    });
  });

  describe("Getting Started section", () => {
    it("should not render if `attached_dwh` token feature is present", async () => {
      await setupPremiumDWH({ user: createMockUser({ is_superuser: true }) });
      const section = screen.queryByRole("tab", {
        name: /^Getting Started/i,
      });
      expect(section).not.toBeInTheDocument();
    });
  });
});
