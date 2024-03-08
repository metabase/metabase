import { render, screen } from "@testing-library/react";

import { DateQuarterYearWidget } from "./DateQuarterYearWidget";

describe("DateQuarterYearWidget", () => {
  it("should render correctly", () => {
    render(
      <DateQuarterYearWidget
        value={"2-2020"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateQuarterYearWidget>,
    );

    expect(screen.getByText("Q1")).toBeVisible();
    expect(screen.getByText("Q4")).toBeVisible();

    expect(screen.getByTestId("select-button")).toHaveTextContent("2020");
    expect(screen.getByText("Q2")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Q1")).toHaveAttribute("aria-selected", "false");
  });
});
