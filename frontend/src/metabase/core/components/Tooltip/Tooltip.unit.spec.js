import { useState, forwardRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Tooltip from "./Tooltip";

const defaultTooltip = "tooltip content";

const defaultTarget = (
  <div id="child-target" style={{ width: 100, height: 100 }}>
    child target element
  </div>
);

function setup({
  target = defaultTarget,
  tooltip = defaultTooltip,
  ...otherProps
} = {}) {
  return render(
    <div>
      <Tooltip tooltip={tooltip} {...otherProps}>
        {target}
      </Tooltip>
    </div>,
  );
}

describe("Tooltip", () => {
  it("should be visible on hover of child target element", () => {
    setup();
    userEvent.hover(screen.getByText("child target element"));
    expect(screen.getByText("tooltip content")).toBeInTheDocument();
  });

  describe("isOpen", () => {
    it("should override hover behavior", () => {
      setup({ isOpen: false });

      userEvent.hover(screen.getByText("child target element"));
      expect(screen.queryByText("tooltip content")).not.toBeInTheDocument();
    });

    it("should be visible when isOpen is set to true", () => {
      setup({ isOpen: true });
      expect(screen.getByText("tooltip content")).toBeInTheDocument();
    });
  });

  describe("isEnabled", () => {
    it("should override hover behavior when false", () => {
      setup({ isEnabled: false });

      userEvent.hover(screen.getByText("child target element"));
      expect(screen.queryByText("tooltip content")).not.toBeInTheDocument();
    });

    it("should not override hover behavior when true", () => {
      setup({ isEnabled: true });

      userEvent.hover(screen.getByText("child target element"));
      expect(screen.getByText("tooltip content")).toBeInTheDocument();
    });

    it("should override isOpen when false", () => {
      setup({ isEnabled: false, isOpen: true });

      userEvent.hover(screen.getByText("child target element"));
      expect(screen.queryByText("tooltip content")).not.toBeInTheDocument();
    });

    it("should not override isOpen when true", () => {
      setup({ isEnabled: true, isOpen: true });

      userEvent.hover(screen.getByText("child target element"));
      expect(screen.getByText("tooltip content")).toBeInTheDocument();
    });
  });

  it("should wrap target Components without forwarded refs in a <span>", () => {
    function BadTarget() {
      return <div>bad target</div>;
    }

    setup({ isOpen: true, target: <BadTarget /> });

    const tooltip = screen.getByTestId("tooltip-component-wrapper");

    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("bad target");
  });

  it("should not wrap target Components with forwarded refs", () => {
    const GoodTarget = forwardRef(function GoodTarget(props, ref) {
      return <div ref={ref}>good target</div>;
    });

    setup({ isOpen: true, target: <GoodTarget /> });

    expect(
      screen.queryByTestId("tooltip-component-wrapper"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("good target")).toBeInTheDocument();
  });

  it("should not wrap targets that are JSX dom elements", () => {
    setup({ isOpen: true, target: <div>good target</div> });

    expect(
      screen.queryByTestId("tooltip-component-wrapper"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("good target")).toBeInTheDocument();
  });

  it("should still render children when not given tooltip content", () => {
    setup({ isOpen: true, tooltip: null });

    expect(screen.getByText("child target element")).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector(".tippy-box")).toBeNull();
  });

  it("should be themed as a tooltip", () => {
    setup({ isOpen: true });
    expect(screen.getByRole("tooltip")).toHaveAttribute(
      "data-theme",
      "tooltip ",
    );
  });

  it("should support using a reference element instead of a child target element", () => {
    function ReferenceTooltipTest() {
      const [eventTarget, setEventTarget] = useState();
      return (
        <div>
          <Tooltip reference={eventTarget} tooltip="reference tooltip" isOpen />
          <div
            onClick={event => {
              setEventTarget(event.target);
            }}
            style={{ width: 100, height: 100 }}
          >
            sibling element
          </div>
        </div>
      );
    }

    render(<ReferenceTooltipTest />);
    expect(screen.queryByText("reference tooltip")).not.toBeInTheDocument();

    screen.getByText("sibling element").click();

    expect(screen.getByText("reference tooltip")).toBeInTheDocument();
  });
});
