import userEvent from "@testing-library/user-event";
import React, { useEffect } from "react";

import { render, screen } from "__support__/ui";

import { type ITippyPopoverProps, TippyPopover } from "./TippyPopover";

const defaultTarget = (
  <div id="child-target" style={{ width: 100, height: 100 }}>
    child target element
  </div>
);

function Content({ fn }: { fn?: jest.Mock }) {
  useEffect(() => {
    fn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div>popover content</div>;
}

function setup({
  contentFn,
  target = defaultTarget,
  parentOnClick,
  ...otherProps
}: {
  contentFn?: jest.Mock;
  target?: JSX.Element;
  parentOnClick?: jest.Mock;
} & ITippyPopoverProps = {}) {
  return render(
    <div onClick={parentOnClick}>
      <TippyPopover content={<Content fn={contentFn} />} {...otherProps}>
        {target}
      </TippyPopover>
    </div>,
  );
}

describe("Popover", () => {
  it("should be visible on hover of child target element", async () => {
    setup();
    await userEvent.hover(screen.getByText("child target element"));
    expect(await screen.findByText("popover content")).toBeVisible();
  });

  it("should be themed as a popover", () => {
    setup({ visible: true });
    expect(screen.getByRole("tooltip")).toHaveAttribute(
      "data-theme",
      "popover",
    );
  });

  describe("lazy", () => {
    it("should by default lazily render content", async () => {
      const contentFn = jest.fn();
      setup({ contentFn });
      expect(contentFn).not.toHaveBeenCalled();
      await userEvent.hover(screen.getByText("child target element"));

      await screen.findByText("popover content");
      expect(contentFn).toHaveBeenCalled();
    });

    it("should be configurable to allow for immediate rendering", () => {
      const contentFn = jest.fn();
      setup({ contentFn, lazy: false });
      expect(contentFn).toHaveBeenCalled();
      expect(screen.queryByText("popover content")).not.toBeInTheDocument();
    });
  });

  describe("disableContentSandbox", () => {
    it("should by default prevent the bubbling of events from content", async () => {
      const parentOnClick = jest.fn();
      setup({ visible: true, parentOnClick });

      const popover = await screen.findByText("popover content");
      popover.click();

      expect(parentOnClick).not.toHaveBeenCalled();
    });

    it("should be configurable to allow events to bubble", async () => {
      const parentOnClick = jest.fn();
      setup({
        visible: true,
        disableContentSandbox: true,
        parentOnClick,
      });

      const popover = await screen.findByText("popover content");
      popover.click();

      expect(parentOnClick).toHaveBeenCalled();
    });
  });
});
