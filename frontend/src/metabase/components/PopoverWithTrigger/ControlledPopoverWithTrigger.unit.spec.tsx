import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  ControlledPopoverWithTriggerProps,
  RenderTrigger,
  PopoverWithTriggerContent,
} from "./ControlledPopoverWithTrigger";
import ControlledPopoverWithTrigger from "./ControlledPopoverWithTrigger";

console.error = jest.fn();

type SetupProps = Partial<ControlledPopoverWithTriggerProps> & {
  visible: ControlledPopoverWithTriggerProps["visible"];
};

function setup({
  triggerContent = "trigger content",
  popoverContent = <div>popover content</div>,
  onClose = jest.fn(),
  onOpen = jest.fn(),
  ...props
}: SetupProps) {
  const utils = render(
    <div>
      <div>something outside of the popover</div>
      <ControlledPopoverWithTrigger
        {...props}
        triggerContent={triggerContent}
        popoverContent={popoverContent}
        onOpen={onOpen}
        onClose={onClose}
      />
    </div>,
  );
  return {
    ...utils,
    onOpen,
    onClose,
    props: {
      triggerContent,
      popoverContent,
      onClose,
      onOpen,
      ...props,
    },
  };
}

describe("ControlledPopoverWithTrigger", () => {
  describe("renderTrigger", () => {
    const renderTrigger: RenderTrigger = ({ visible, onClick }) => (
      <button onClick={onClick} data-visible={visible}>
        custom trigger
      </button>
    );

    it("the component should accept a function that returns a trigger", () => {
      setup({ visible: false, renderTrigger });
      expect(screen.getByText("custom trigger")).toBeInTheDocument();
      expect(screen.getByText("custom trigger")).toHaveAttribute(
        "data-visible",
        "false",
      );
    });

    it("should be clickable via the onClick prop the function receives as an argument", async () => {
      const { onOpen } = setup({ visible: false, renderTrigger });
      await userEvent.click(screen.getByText("custom trigger"));
      expect(onOpen).toHaveBeenCalled();
    });
  });

  describe("triggerContent", () => {
    it("should render a trigger button with the given content", () => {
      setup({ visible: false });
      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveTextContent("trigger content");
    });

    it("should be clickable and trigger the onOpen prop of the component", async () => {
      const { onOpen } = setup({ visible: false });
      await userEvent.click(screen.getByText("trigger content"));
      expect(onOpen).toHaveBeenCalled();
    });
  });

  describe("visible", () => {
    it("should be openable/closable via the visible prop", async () => {
      const { rerender, props } = setup({ visible: true });

      expect(await screen.findByText("popover content")).toBeVisible();

      rerender(<ControlledPopoverWithTrigger {...props} visible={false} />);

      expect(screen.queryByText("popover content")).not.toBeInTheDocument();
    });
  });

  describe("when the popover is open", () => {
    it("should show the popover content", async () => {
      setup({ visible: true });
      expect(await screen.findByText("popover content")).toBeVisible();
    });

    it("should be able to trigger an onClose event via an outside click", async () => {
      const { onClose } = setup({ visible: true });
      await userEvent.click(
        screen.getByText("something outside of the popover"),
      );
      expect(onClose).toHaveBeenCalled();
    });

    it("should be able to trigger an onClose event via an Esc press", async () => {
      const { onClose } = setup({ visible: true });
      await userEvent.type(document.body, "{Escape}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("popoverContent fn prop", () => {
    const popoverContent: PopoverWithTriggerContent = ({ closePopover }) => (
      <button onClick={closePopover}>popover content</button>
    );

    it("should pass the onClose prop to the popoverContent fn", async () => {
      const { onClose } = setup({ visible: true, popoverContent });
      await userEvent.click(await screen.findByText("popover content"));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("disabled true, visible false", () => {
    it("should prevent the triggering of the onOpen fn", async () => {
      const { onOpen } = setup({ disabled: true, visible: false });
      await userEvent.click(screen.getByText("trigger content"));
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("disabled true, visible true", () => {
    it("should not render the popover", () => {
      setup({ disabled: true, visible: true });
      expect(screen.queryByText("popover content")).not.toBeInTheDocument();
    });
  });
});
