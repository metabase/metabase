import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setupAdvancedPermissions } from "./setup";

describe("Add data modal (EE with token)", () => {
  describe("Database panel", () => {
    it("should not offer a setting manager to manage databases", async () => {
      setupAdvancedPermissions({ isAdmin: false, canManageSettings: true });
      await userEvent.click(screen.getByRole("tab", { name: /Database$/ }));

      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Manage databases")).not.toBeInTheDocument();
    });
  });

  describe("CSV panel", () => {
    it("should offer a setting manager to enable (csv) uploads", async () => {
      setupAdvancedPermissions({
        isAdmin: false,
        canManageSettings: true,
        uploadsEnabled: false,
        canUpload: true,
      });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();
      expect(await screen.findByText("Enable uploads")).toBeInTheDocument();
    });

    it("should offer a setting manager to manage (csv) uploads", async () => {
      setupAdvancedPermissions({
        isAdmin: false,
        canManageSettings: true,
        uploadsEnabled: true,
        canUpload: true,
      });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();
    });

    /**
     * I think this is a bug, and it shouldn't work like this.
     * But this behavior is already present in the other parts of the app so I didn't
     * want to create an exception here.
     * I argued that we shouldn't even show the uploads option to settings managers without
     * sufficient data permissions, but was told by The Product that this is fine.
     * Slack context: https://metaboat.slack.com/archives/C01LQQ2UW03/p1749213616959619
     */
    it("should offer a setting manager (who lacks upload permissions) to manage (csv) uploads", async () => {
      setupAdvancedPermissions({
        isAdmin: false,
        canManageSettings: true,
        uploadsEnabled: true,
        canUpload: false,
      });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();
    });
  });
});
