import { render, screen } from "@testing-library/react";

import { DateRelativeWidget } from "./DateRelativeWidget";

describe("DateRelativeWidget", () => {
  it("should render correctly", () => {
    render(
      <DateRelativeWidget
        value={"past1days"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateRelativeWidget>,
    );

    expect(screen.getByText("Yesterday")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Today")).toBeVisible();
    expect(screen.getByText("Today")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Past 7 days")).toBeVisible();
    expect(screen.getByText("Past 30 days")).toBeVisible();
  });
});
