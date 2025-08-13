import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { browseDatabase } from "metabase/lib/urls";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { HeaderLinkGroup } from "./HeaderLinkGroup";

const setup = (mockDatabase: Database) => {
  renderWithProviders(
    <Route
      path="*"
      component={() => <HeaderLinkGroup database={mockDatabase} />}
    />,
    { withRouter: true },
  );
};

describe("HeaderLinkGroup", () => {
  describe("rendering", () => {
    it("renders both permission and browse buttons", () => {
      setup(createMockDatabase());

      expect(screen.getByText("Manage permissions")).toBeInTheDocument();
      expect(screen.getByText("Browse data")).toBeInTheDocument();
    });

    it("renders manage permissions button with correct link", () => {
      const mockDatabase = createMockDatabase({ id: 37 });
      setup(mockDatabase);

      const managePermissionsLink = screen
        .getByText("Manage permissions")
        .closest("a");
      expect(managePermissionsLink).toHaveAttribute(
        "href",
        "/admin/permissions/data/database/37",
      );
    });

    it("renders browse data button with correct link", () => {
      const mockDatabase = createMockDatabase();
      setup(mockDatabase);

      const browseDataLink = screen.getByText("Browse data").closest("a");
      const expectedHref = browseDatabase(mockDatabase);
      expect(browseDataLink).toHaveAttribute("href", expectedHref);
      expect(browseDataLink).toHaveAttribute("target", "_blank");
    });

    it("renders external icon on browse data button", () => {
      setup(createMockDatabase());

      const browseDataLink = screen.getByText("Browse data").closest("a");
      expect(browseDataLink).toBeInTheDocument();

      // Check that the external icon is present
      expect(screen.getByLabelText("external icon")).toBeInTheDocument();
    });
  });

  describe("when database sync is in progress", () => {
    it("disables the browse data button", () => {
      const mockDatabase = createMockDatabase({
        initial_sync_status: "incomplete",
      });
      setup(mockDatabase);

      const browseDataLink = screen.getByText("Browse data").closest("a");
      expect(browseDataLink).toHaveAttribute("data-disabled", "true");
    });

    it("does not disable the manage permissions button", () => {
      const mockDatabase = createMockDatabase({
        initial_sync_status: "complete",
      });
      setup(mockDatabase);

      const browseDataLink = screen.getByText("Browse data").closest("a");
      expect(browseDataLink).not.toHaveAttribute("data-disabled", "true");
    });
  });
});
