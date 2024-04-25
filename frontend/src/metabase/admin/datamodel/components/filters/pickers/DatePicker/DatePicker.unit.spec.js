import { fireEvent, render, screen } from "@testing-library/react";

import DatePicker from "../LegacyDatePicker/DatePicker";

const nop = () => {};

describe("DatePicker", () => {
  it("should render 'Previous 30 Days'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], -30, "day"]}
        onFilterChange={nop}
      />,
    );

    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByText("days")).toBeInTheDocument();
  });

  it("should render 'Next 1 Month'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], 1, "month"]}
        onFilterChange={nop}
      />,
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    expect(screen.getByText("month")).toBeInTheDocument();
  });

  it("should render 'Current Week'", () => {
    render(
      <DatePicker
        filter={["time-interval", ["field", 1, null], "current", "week"]}
        onFilterChange={nop}
      />,
    );
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("week")).toBeInTheDocument();
  });

  it("should render 'Between'", () => {
    render(
      <DatePicker
        filter={["between", ["field", 1, null], "2018-01-01", null]}
        onFilterChange={nop}
      />,
    );
    const NEXT = screen.getByRole("img", { name: /chevronright icon/i });
    expect(screen.getByText("Between")).toBeInTheDocument();
    expect(screen.getByText("January 2018")).toBeInTheDocument();

    for (let i = 0; i < 24; i++) {
      fireEvent.click(NEXT);
    }
    expect(screen.getByText("January 2020")).toBeInTheDocument();
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
