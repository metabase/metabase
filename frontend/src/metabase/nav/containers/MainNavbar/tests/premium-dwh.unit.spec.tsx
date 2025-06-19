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

    it("should not render DWH Upload section to non-admins", async () => {
      await setupPremiumDWH({
        user: createMockUser({ is_superuser: false }),
      });
      expect(screen.queryByTestId("dwh-upload")).not.toBeInTheDocument();
    });
  });
});
