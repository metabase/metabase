import { render, fireEvent, screen } from "@testing-library/react";

import Slider from "./Slider";

describe("Slider", () => {
  it("should render 2 range inputs", () => {
    render(<Slider value={[10, 40]} onChange={() => null} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");
    const maxInput = screen.getByLabelText("max");

    expect(minInput).toHaveAttribute("type", "range");
    expect(maxInput).toHaveAttribute("type", "range");
  });

  it("should always have values in range", () => {
    render(
      <Slider value={[10, 412]} onChange={() => null} min={0} max={100} />,
    );

    const minInput = screen.getByLabelText("min");

    expect(minInput).toHaveAttribute("max", "412");
  });

  it("should call onChange with the new value on mouseUp", () => {
    const spy = jest.fn();
    render(<Slider value={[10, 20]} onChange={spy} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");
    const maxInput = screen.getByLabelText("max");

    // would be nice to use userEvent when we upgrade to v14 so we can mock drag events
    fireEvent.change(minInput, { target: { value: "5" } });
    fireEvent.mouseUp(minInput);
    fireEvent.change(maxInput, { target: { value: "15" } });
    fireEvent.mouseUp(maxInput);

    const [firstCall, secondCall] = spy.mock.calls;

    expect(firstCall[0]).toEqual([5, 20]);
    expect(secondCall[0]).toEqual([5, 15]);
  });

  // handling input via arrow keys
  it("should call onChange with the new value on keyup", () => {
    const spy = jest.fn();
    render(<Slider value={[10, 20]} onChange={spy} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");
    const maxInput = screen.getByLabelText("max");

    fireEvent.change(minInput, { target: { value: "5" } });
    fireEvent.keyUp(minInput);
    fireEvent.change(maxInput, { target: { value: "15" } });
    fireEvent.keyUp(maxInput);

    const [firstCall, secondCall] = spy.mock.calls;

    expect(firstCall[0]).toEqual([5, 20]);
    expect(secondCall[0]).toEqual([5, 15]);
  });

  it("should sort input values on mouse up", () => {
    const spy = jest.fn();
    render(<Slider value={[2, 1]} onChange={spy} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");

    fireEvent.mouseUp(minInput);
    expect(spy.mock.calls[0][0]).toEqual([1, 2]);
  });

  it("should show tooltips on mouseOver", () => {
    render(<Slider value={[10, 40]} onChange={() => null} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");
    const minTooltip = screen.getByTestId("min-slider-tooltip");
    const maxTooltip = screen.getByTestId("max-slider-tooltip");

    expect(minTooltip).toHaveStyle("opacity: 0");
    expect(maxTooltip).toHaveStyle("opacity: 0");
    fireEvent.mouseOver(minInput);
    expect(minTooltip).toHaveStyle("opacity: 1");
    expect(maxTooltip).toHaveStyle("opacity: 1");
  });

  it("should hide tooltips on mouseLeave", () => {
    render(<Slider value={[10, 40]} onChange={() => null} min={0} max={100} />);

    const minInput = screen.getByLabelText("min");
    const minTooltip = screen.getByTestId("min-slider-tooltip");
    const maxTooltip = screen.getByTestId("max-slider-tooltip");

    fireEvent.mouseEnter(minInput);
    expect(minTooltip).toHaveStyle("opacity: 1");
    expect(maxTooltip).toHaveStyle("opacity: 1");
    fireEvent.mouseLeave(minInput);
    expect(minTooltip).toHaveStyle("opacity: 0");
    expect(maxTooltip).toHaveStyle("opacity: 0");
  });
});
