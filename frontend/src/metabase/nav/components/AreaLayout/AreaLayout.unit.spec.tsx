import { fireEvent } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";

import { AreaLayout } from "./AreaLayout";

interface SetupOpts {
  isNavbarOpened?: boolean;
}

const setup = ({ isNavbarOpened = true }: SetupOpts = {}) => {
  const onNavbarToggle = jest.fn();

  renderWithProviders(
    <AreaLayout
      logo={<div>{"Logo"}</div>}
      testId="area-nav"
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
  it("renders its children", () => {
    setup();

    expect(screen.getByTestId("content")).toHaveTextContent("Content");
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
