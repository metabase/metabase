import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "./Input";

describe("Input", () => {
  it("should render icon tooltips when hover them", () => {
    render(
      <Input
        leftIconTooltip="left tooltip"
        rightIconTooltip="right tooltip"
        leftIcon="search"
        rightIcon="check"
      />,
    );

    const leftIcon = screen.getByTestId("input-left-icon-button");
    userEvent.hover(leftIcon);
    expect(screen.getByText("left tooltip")).toBeInTheDocument();

    const rightIcon = screen.getByTestId("input-right-icon-button");
    userEvent.hover(rightIcon);
    expect(screen.getByText("right tooltip")).toBeInTheDocument();
  });
});
