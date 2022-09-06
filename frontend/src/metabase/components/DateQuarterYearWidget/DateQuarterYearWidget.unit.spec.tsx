import React from "react";
import { render, screen } from "@testing-library/react";

import DateQuarterYearWidget from "./DateQuarterYearWidget";

describe("DateQuarterYearWidget", () => {
  it("should render correctly", () => {
    const { container } = render(
      <DateQuarterYearWidget
        value={"2-2020"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateQuarterYearWidget>,
    );

    expect(screen.getByText("Q1")).toBeVisible();
    expect(screen.getByText("Q4")).toBeVisible();

    expect(screen.getByTestId("select-button")).toHaveTextContent("2020");
    expect(
      container.querySelector("li[aria-selected='true']"),
    ).toHaveTextContent("Q2");
  });
});
