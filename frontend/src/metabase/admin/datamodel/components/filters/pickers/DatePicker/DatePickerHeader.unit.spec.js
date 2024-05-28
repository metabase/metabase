import { render, screen } from "@testing-library/react";

import DatePickerHeader from "./DatePickerHeader";

const nop = () => {};

describe("DatePickerHeader", () => {
  it("should render 'Past'/'Current'/'Next'", () => {
    render(
      <DatePickerHeader
        filter={["time-interval", ["field", 1, null], -30, "day"]}
        onFilterChange={nop}
      />,
    );

    expect(screen.getByText("Past")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("should render 'Between'/'before'/'after'/'on'", () => {
    render(
      <DatePickerHeader
        filter={[">", ["field", 1, null], "2018-01-01"]}
        onFilterChange={nop}
      />,
    );
    expect(screen.getByText("Between")).toBeInTheDocument();
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });
});
