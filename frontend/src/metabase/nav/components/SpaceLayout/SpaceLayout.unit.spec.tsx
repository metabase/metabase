import { fireEvent } from "@testing-library/react";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { SpaceLayout, SpaceTab } from "./SpaceLayout";

interface SetupOpts {
  isNavbarOpened?: boolean;
}

const setup = ({ isNavbarOpened = true }: SetupOpts = {}) => {
  const onNavbarToggle = jest.fn();

  renderWithProviders(
    <SpaceLayout
      logo={<div>{"Logo"}</div>}
      testId="space-nav"
      isLoading={false}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={onNavbarToggle}
      upperNav={null}
    >
      <div data-testid="content">{"Content"}</div>
    </SpaceLayout>,
  );

  return { onNavbarToggle };
};

const renderTab = ({ isSelected }: { isSelected: boolean }) =>
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SpaceLayout
          logo={<div>{"Logo"}</div>}
          testId="space-nav"
          isLoading={false}
          isNavbarOpened
          onNavbarToggle={jest.fn()}
          upperNav={
            <SpaceTab
              label="Dependency diagnostics"
              icon="search_check"
              to="/monitor/dependency-diagnostics"
              isSelected={isSelected}
              showLabel
            />
          }
        >
          <div data-testid="content">{"Content"}</div>
        </SpaceLayout>
      )}
    />,
    { withRouter: true },
  );

describe("SpaceLayout", () => {
  describe("SpaceTab", () => {
    it("marks the selected tab as the current page for assistive tech", () => {
      renderTab({ isSelected: true });

      const tab = screen.getByRole("link", { name: "Dependency diagnostics" });
      expect(tab).toHaveAttribute("aria-current", "page");
    });

    it("does not mark an unselected tab as current", () => {
      renderTab({ isSelected: false });

      const tab = screen.getByRole("link", { name: "Dependency diagnostics" });
      expect(tab).not.toHaveAttribute("aria-current");
    });
  });

  describe("sidebar toggle shortcuts", () => {
    it("toggles a collapsed sidebar open with '['", () => {
      const { onNavbarToggle } = setup({ isNavbarOpened: false });

      fireEvent.keyDown(document.body, { key: "[" });

      expect(onNavbarToggle).toHaveBeenCalledWith(true);
    });

    it("toggles an open sidebar closed with Cmd + '.'", () => {
      const { onNavbarToggle } = setup({ isNavbarOpened: true });

      fireEvent.keyDown(document.body, { key: ".", metaKey: true });

      expect(onNavbarToggle).toHaveBeenCalledWith(false);
    });

    it("toggles with Ctrl + '.' as well", () => {
      const { onNavbarToggle } = setup({ isNavbarOpened: false });

      fireEvent.keyDown(document.body, { key: ".", ctrlKey: true });

      expect(onNavbarToggle).toHaveBeenCalledWith(true);
    });

    it("does not toggle on '.' without a modifier", () => {
      const { onNavbarToggle } = setup({ isNavbarOpened: true });

      fireEvent.keyDown(document.body, { key: "." });

      expect(onNavbarToggle).not.toHaveBeenCalled();
    });
  });
});
