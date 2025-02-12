import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ToolbarButton, type ToolbarButtonProps } from "./ToolbarButton";

const setup = (props: Partial<ToolbarButtonProps> = {}) => {
  const mergedProps: ToolbarButtonProps = {
    "aria-label": "Test Button",
    icon: "gear",
    ...props,
  };
  render(<ToolbarButton {...mergedProps} />);
};

describe("ToolbarButton", () => {
  describe("Rendering", () => {
    it("renders with default props", () => {
      setup();
      const button = screen.getByTestId("toolbar-button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label", "Test Button");
    });

    it("renders with custom icon", () => {
      setup({ icon: "check" });
      const button = screen.getByTestId("toolbar-button");
      expect(button).toBeInTheDocument();
      expect(screen.getByLabelText("check icon")).toBeInTheDocument();
    });

    it("renders children instead of icon when provided", () => {
      setup({ children: <span>Custom Content</span> });
      expect(screen.getByText("Custom Content")).toBeInTheDocument();
      expect(screen.queryByLabelText("gear icon")).not.toBeInTheDocument();
    });
  });

  describe("Visibility", () => {
    it("is visible on small screens by default", () => {
      setup();
      const button = screen.getByTestId("toolbar-button");
      expect(button).toHaveStyle({ display: "flex" });
    });

    it("can be hidden on small screens", () => {
      setup({ visibleOnSmallScreen: false });
      const button = screen.getByTestId("toolbar-button");
      expect(button).toHaveStyle({ display: "none" });
    });
  });

  describe("Tooltip", () => {
    it("renders without tooltip by default", () => {
      setup();
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("renders with tooltip when tooltipLabel is provided", async () => {
      setup({ tooltipLabel: "Tooltip Text" });
      await userEvent.hover(screen.getByTestId("toolbar-button"));
      expect(await screen.findByText("Tooltip Text")).toBeInTheDocument();
    });
  });

  describe("Background", () => {
    it("has background by default", () => {
      setup();
      const button = screen.getByTestId("toolbar-button");
      expect(button).not.toHaveStyle({ background: "transparent" });
    });

    it("can have transparent background", () => {
      setup({ hasBackground: false });
      const button = screen.getByTestId("toolbar-button");
      expect(button).toHaveStyle({ background: "transparent" });
    });
  });

  describe("Interaction", () => {
    it("calls onClick when clicked and not disabled", async () => {
      const onClick = jest.fn();
      setup({ onClick });
      const button = screen.getByTestId("toolbar-button");
      await userEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when clicked and disabled", async () => {
      const onClick = jest.fn();
      setup({ onClick, disabled: true });
      const button = screen.getByTestId("toolbar-button");
      await userEvent.click(button, {
        pointerEventsCheck: PointerEventsCheckLevel.Never,
      });
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
