import React from "react";
import { render, screen } from "@testing-library/react";
import Slider from "./Slider";

describe("Slider", () => {
  it("should render 2 range inputs", () => {
    const { container } = render(
      <Slider value={[10, 40]} onChange={() => null} min={0} max={100} />,
    );

    expect(container.querySelectorAll('input[type="range"]').length).toBe(2);
  });
});
