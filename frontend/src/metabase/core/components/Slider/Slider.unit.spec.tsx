import React from "react";
import { render, fireEvent } from "@testing-library/react";
import Slider from "./Slider";

describe("Slider", () => {
  it("should render 2 range inputs", () => {
    const { container } = render(
      <Slider value={[10, 40]} onChange={() => null} min={0} max={100} />,
    );

    expect(container.querySelectorAll('input[type="range"]').length).toBe(2);
  });

  it("should always have values in range", () => {
    const { container } = render(
      <Slider value={[10, 412]} onChange={() => null} min={0} max={100} />,
    );

    expect(
      container.querySelector('input[type="range"]')?.getAttribute("max"),
    ).toBe("412");
  });

  it("should call onChange with the new value on input change", () => {
    const spy = jest.fn();
    const { container } = render(
      <Slider value={[10, 20]} onChange={spy} min={0} max={100} />,
    );

    const [minInput, maxInput] = container.querySelectorAll(
      'input[type="range"]',
    );

    // would be nice to use userEvent when we upgrade to v14 so we mock drage events
    fireEvent.change(minInput, { target: { value: "5" } });
    fireEvent.change(maxInput, { target: { value: "15" } });

    const [firstCall, secondCall] = spy.mock.calls;

    expect(firstCall[0]).toEqual([5, 20]);
    expect(secondCall[0]).toEqual([10, 15]);
  });

  it("should sort input values on mouse up", () => {
    const spy = jest.fn();
    const { container } = render(
      <Slider value={[2, 1]} onChange={spy} min={0} max={100} />,
    );

    const minInput = container.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement;

    fireEvent.mouseUp(minInput);
    expect(spy.mock.calls[0][0]).toEqual([1, 2]);
  });
});
