import React from "react";
import { render, screen } from "@testing-library/react";

import DateRelativeWidget from "./DateRelativeWidget";

describe("DateRelativeWidget", () => {
  it("should render correctly", () => {
    const { container } = render(
      <DateRelativeWidget
        value={"past1days"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateRelativeWidget>,
    );

    expect(
      container.querySelector("button[aria-selected='true']"),
    ).toHaveTextContent("Yesterday");

    expect(screen.getByText("Today")).toBeVisible();
    expect(screen.getByText("Past 7 days")).toBeVisible();
    expect(screen.getByText("Past 30 days")).toBeVisible();
  });
});
