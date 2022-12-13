import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "./Input";

describe("Input", () => {
  it("should render icon tooltips when hover them", () => {
    const { getByTestId, getByText } = render(
      <Input
        leftIconTooltip="left tooltip"
        rightIconTooltip="right tooltip"
        leftIcon="search"
        rightIcon="check"
      />,
    );

    const leftIcon = getByTestId("input-left-icon-button");
    userEvent.hover(leftIcon);
    expect(getByText("left tooltip")).toBeInTheDocument();

    const rightIcon = getByTestId("input-right-icon-button");
    userEvent.hover(rightIcon);
    expect(getByText("right tooltip")).toBeInTheDocument();
  });
});
