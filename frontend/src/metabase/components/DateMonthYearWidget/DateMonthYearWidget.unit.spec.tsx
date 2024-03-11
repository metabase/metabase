import { render, screen } from "@testing-library/react";

import { DateMonthYearWidget } from "./DateMonthYearWidget";

describe("DateMonthYearWidget", () => {
  it("should render correctly", () => {
    render(
      <DateMonthYearWidget
        value={"2021-07"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateMonthYearWidget>,
    );

    expect(screen.getByText("January")).toBeVisible();
    expect(screen.getByText("December")).toBeVisible();

    // 07 = July and year 2021
    expect(screen.getByTestId("select-button")).toHaveTextContent("2021");
    expect(screen.getByText("July")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("June")).toHaveAttribute("aria-selected", "false");
  });
});
