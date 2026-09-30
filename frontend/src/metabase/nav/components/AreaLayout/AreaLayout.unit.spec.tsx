import { fireEvent } from "@testing-library/react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { AreaLayout } from "./AreaLayout";

const NAV_STORAGE_KEY = "test-area-nav";

interface SetupOpts {
  isNavbarOpened?: boolean;
}

const setup = ({ isNavbarOpened = true }: SetupOpts = {}) => {
  const onNavbarToggle = jest.fn();

  renderWithProviders(
    <AreaLayout
      logo={<div>{"Logo"}</div>}
      testId="area-nav"
      navStorageKey={NAV_STORAGE_KEY}
      isLoading={false}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={onNavbarToggle}
      upperNav={null}
    >
      <div data-testid="content">{"Content"}</div>
    </AreaLayout>,
  );

  return { onNavbarToggle };
};

describe("AreaLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders its children", () => {
    setup();

    expect(screen.getByTestId("content")).toHaveTextContent("Content");
  });

  describe("resizable nav", () => {
    it("is resizable at the medium width when opened", () => {
      setup({ isNavbarOpened: true });

      const panel = screen.getByTestId("resizable-side-panel");
      expect(panel).toHaveStyle({ width: "320px" });
      expect(within(panel).getByTestId("area-nav")).toBeInTheDocument();
      expect(
        within(panel).getByTestId("side-panel-resize-handle"),
      ).toBeInTheDocument();
    });

    it("is not resizable when collapsed", () => {
      setup({ isNavbarOpened: false });

      expect(screen.getByTestId("area-nav")).toBeInTheDocument();
      expect(
        screen.queryByTestId("resizable-side-panel"),
      ).not.toBeInTheDocument();
    });

    it("opens at the width the user last resized this area's nav to", () => {
      setStoredSidePanelWidth(NAV_STORAGE_KEY, 280);

      setup({ isNavbarOpened: true });

      expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
        width: "280px",
      });
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
