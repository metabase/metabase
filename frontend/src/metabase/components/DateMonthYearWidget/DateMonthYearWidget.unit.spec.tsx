import React from "react";
import { render, screen } from "@testing-library/react";

import DateMonthYearWidget from "./DateMonthYearWidget";

describe("DateMonthYearWidget", () => {
  it("should render correctly", () => {
    const { container } = render(
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
    expect(
      container.querySelector("div[aria-selected='true']"),
    ).toHaveTextContent("July");
  });
});
