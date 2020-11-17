import React from "react";
import { mount } from "enzyme";
import DateRangeWidget from "metabase/parameters/components/widgets/DateRangeWidget";

describe("DateRangeWidget", () => {
  it("should allow selections spanning years", () => {
    const setValue = jest.fn();
    const picker = mount(
      <DateRangeWidget value={"2018-12-01~2018-12-01"} setValue={setValue} />,
    );
    picker
      .find(".Calendar-day.Calendar-day--this-month")
      .first()
      .simulate("click");
    picker.find(".Icon-chevronright").simulate("click");
    picker
      .find(".Calendar-day.Calendar-day--this-month")
      .first()
      .simulate("click");
    expect(setValue).toHaveBeenCalledWith("2018-12-01~2019-01-01");
  });
});
