/* eslint-disable react/prop-types */
import React, { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
  RenderTrigger,
  PopoverWithTriggerContent,
} from "./ControlledPopoverWithTrigger";

function setup(props: ControlledPopoverWithTriggerProps) {
  return render(
    <div>
      <div>something outside of the popover</div>
      <ControlledPopoverWithTrigger {...props} />
    </div>,
  );
}

const onClose = jest.fn();
const onOpen = jest.fn();
const children = <div>popover content</div>;
const triggerContent = "trigger content";

describe("ControlledPopoverWithTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("renderTrigger", () => {
    const renderTrigger: RenderTrigger = ({ visible, onClick }) => (
      <button onClick={onClick} data-visible={visible}>
        custom trigger
      </button>
    );

    beforeEach(() => {
      setup({
        visible: false,
        renderTrigger,
        children,
        onClose,
        onOpen,
      });
    });

    it("the component should accept a function that returns a trigger", () => {
      expect(screen.getByText("custom trigger")).toBeInTheDocument();
      expect(screen.getByText("custom trigger")).toHaveAttribute(
        "data-visible",
        "false",
      );
    });

    it("should be clickable via the onClick prop the function receives as an argument", () => {
      userEvent.click(screen.getByText("custom trigger"));
      expect(onOpen).toHaveBeenCalled();
    });
  });

  describe("triggerContent", () => {
    beforeEach(() => {
      setup({
        visible: false,
        triggerContent,
        children,
        onClose,
        onOpen,
      });
    });

    it("should render a trigger button with the given content", () => {
      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveTextContent("trigger content");
    });

    it("should be clickable and trigger the onOpen prop of the component", () => {
      userEvent.click(screen.getByText("trigger content"));
      expect(onOpen).toHaveBeenCalled();
    });
  });

  describe("visible", () => {
    it("should be openable/closable via the visible prop", async () => {
      const props = {
        triggerContent,
        children,
        onClose,
        onOpen,
      };

      const { rerender } = render(
        <ControlledPopoverWithTrigger visible={true} {...props} />,
      );

      expect(await screen.findByText("popover content")).toBeVisible();

      rerender(<ControlledPopoverWithTrigger visible={false} {...props} />);

      expect(await screen.findByText("popover content")).not.toBeVisible();
    });
  });

  describe("when the popover is open", () => {
    beforeEach(() => {
      setup({
        visible: true,
        triggerContent,
        children,
        onClose,
        onOpen,
      });
    });

    it("should show the popover content", () => {
      expect(screen.getByText("popover content")).toBeVisible();
    });

    it("should be able to trigger an onClose event via an outside click", () => {
      userEvent.click(screen.getByText("something outside of the popover"));
      expect(onClose).toHaveBeenCalled();
    });

    it("should be able to trigger an onClose event via an Esc press", () => {
      userEvent.type(document.body, "{Escape}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("children fn prop", () => {
    beforeEach(() => {
      const children: PopoverWithTriggerContent = ({ onClose }) => (
        <button onClick={onClose}>popover content</button>
      );

      setup({
        visible: true,
        triggerContent,
        children,
        onClose,
        onOpen,
      });
    });

    it("should pass the onClose prop to the children fn", () => {
      userEvent.click(screen.getByText("popover content"));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("disabled true, visible false", () => {
    beforeEach(() => {
      setup({
        disabled: true,
        visible: false,
        triggerContent,
        children,
        onClose,
        onOpen,
      });
    });

    it("should prevent the triggering of the onOpen fn", () => {
      userEvent.click(screen.getByText("trigger content"));
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("disabled true, visible true", () => {
    beforeEach(() => {
      setup({
        disabled: true,
        visible: true,
        triggerContent,
        children,
        onClose,
        onOpen,
      });
    });

    it("should not render the popover", () => {
      expect(screen.queryByText("popover content")).not.toBeInTheDocument();
    });
  });
});
