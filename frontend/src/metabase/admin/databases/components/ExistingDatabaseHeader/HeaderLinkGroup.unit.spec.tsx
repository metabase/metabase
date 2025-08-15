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

      expect(
        screen.getByRole("link", { name: "Manage permissions" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Browse data/ }),
      ).toBeInTheDocument();
    });

    it("renders manage permissions button with correct link", () => {
      const mockDatabase = createMockDatabase({ id: 37 });
      setup(mockDatabase);

      const managePermissionsLink = screen.getByRole("link", {
        name: "Manage permissions",
      });
      expect(managePermissionsLink).toHaveAttribute(
        "href",
        "/admin/permissions/data/database/37",
      );
    });

    it("renders browse data button with correct link", () => {
      const mockDatabase = createMockDatabase();
      setup(mockDatabase);

      const browseDataLink = screen.getByRole("link", { name: /Browse data/ });
      const expectedHref = browseDatabase(mockDatabase);
      expect(browseDataLink).toHaveAttribute("href", expectedHref);
      expect(browseDataLink).toHaveAttribute("target", "_blank");
    });

    it("renders external icon on browse data button", () => {
      setup(createMockDatabase());

      const browseDataLink = screen.getByRole("link", { name: /Browse data/ });
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

      const browseDataButton = screen.getByRole("button", {
        name: /Browse data/,
      });
      expect(browseDataButton).toBeDisabled();
      // when disabled, the element will be a disabled button instead of a link
      expect(
        screen.queryByRole("link", { name: /Browse data/ }),
      ).not.toBeInTheDocument();
    });

    it("does not disable the manage permissions button", () => {
      const mockDatabase = createMockDatabase({
        initial_sync_status: "complete",
      });
      setup(mockDatabase);

      const browseDataLink = screen.getByRole("link", { name: /Browse data/ });
      expect(browseDataLink).not.toHaveAttribute("data-disabled", "true");
    });
  });
});
