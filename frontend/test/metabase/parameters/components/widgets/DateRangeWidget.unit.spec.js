import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DateRangeWidget from "metabase/parameters/components/widgets/DateRangeWidget";

describe("DateRangeWidget", () => {
  it("should allow selections spanning years", () => {
    const setValue = jest.fn();
    render(
      <DateRangeWidget value={"2018-12-01~2018-12-01"} setValue={setValue} />,
    );
    const NEXT = screen.getByRole("img", { name: /chevronright icon/i });
    // There can be day 1 in the next month as well. We want to target this month's day 1 only.
    const FIRST_DAY = screen.getAllByText("1")[0];

    FIRST_DAY.click();
    fireEvent.click(NEXT);
    FIRST_DAY.click();

    expect(setValue).toHaveBeenCalledWith("2018-12-01~2019-01-01");
  });
});
