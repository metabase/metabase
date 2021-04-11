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

    screen.getByText("December 2018");
    fireEvent.click(screen.getByText("15"));
    fireEvent.click(NEXT);
    screen.getByText("January 2019");
    fireEvent.click(screen.getByText("26"));

    expect(setValue).toHaveBeenCalledWith("2018-12-15~2019-01-26");
  });
});
