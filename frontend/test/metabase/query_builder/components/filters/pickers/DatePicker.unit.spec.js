import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker";

const nop = () => {};

describe("DatePicker", () => {
  it("should render 'Previous 30 Days'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], -30, "day"]}
        onFilterChange={nop}
      />,
    );

    screen.getByText("Previous");
    screen.getByDisplayValue("30");
    screen.getByText("Days");
  });

  it("should render 'Next 1 Month'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], 1, "month"]}
        onFilterChange={nop}
      />,
    );
    screen.getByText("Next");
    screen.getByDisplayValue("1");
    screen.getByText("Month");
  });

  it("should render 'Current Week'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], "current", "week"]}
        onFilterChange={nop}
      />,
    );
    screen.getByText("Current");
    screen.getByText("Week");
  });

  it("should render 'Between'", () => {
    render(
      <DatePicker
        filter={["between", ["field", 1, null], "2018-01-01", null]}
        onFilterChange={nop}
      />,
    );
    const NEXT = screen.getByRole("img", { name: /chevronright icon/i });
    screen.getByText("Between");
    screen.getByText("January 2018");

    for (let i = 0; i < 24; i++) {
      fireEvent.click(NEXT);
    }
    screen.getByText("January 2020");
  });

  it("should call onFilterChange with updated filter", () => {
    const spy = jest.fn();
    render(
      <DatePicker
        filter={[
          "time-interval",
          ["field", 1, null],
          -30,
          "day",
          { "include-current": true },
        ]}
        onFilterChange={spy}
      />,
    );

    const INPUT = screen.getByRole("textbox");
    fireEvent.change(INPUT, { target: { value: "-20" } });
    fireEvent.blur(INPUT);

    expect(spy).toHaveBeenCalledWith([
      "time-interval",
      ["field", 1, null],
      -20,
      "day",
      { "include-current": true },
    ]);
  });
});
