import React from "react";
import { render, screen } from "@testing-library/react";
import DatePickerHeader from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerHeader";

const nop = () => {};

describe("DatePickerHeader", () => {
  it("should render 'Past'/'Current'/'Next'", () => {
    render(
      <DatePickerHeader
        filter={["time-interval", ["field", 1, null], -30, "day"]}
        onFilterChange={nop}
      />,
    );

    screen.getByText("Past");
    screen.getByText("Current");
    screen.getByText("Next");
  });

  it("should render 'Between'/'before'/'after'/'on'", () => {
    render(
      <DatePickerHeader
        filter={[">", ["field", 1, null], "2018-01-01"]}
        onFilterChange={nop}
      />,
    );
    screen.getByText("Between");
    screen.getByText("Before");
    screen.getByText("On");
    screen.getByText("After");
  });
});
