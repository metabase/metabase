import React from "react";
import moment from "moment-timezone";
import { render, screen } from "__support__/ui";
import MetabaseSettings from "metabase/lib/settings";
import { updateMomentStartOfWeek } from "metabase/lib/i18n";
import Calendar, { CalendarProps } from "./Calendar";

describe("Calendar", () => {
  it("should render weekday short names", () => {
    setup();

    expect(
      screen
        .getAllByTestId("calendar-day-name")
        .map((dayEl, index) => dayEl.textContent),
    ).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });

  it("should render days based on first day of the week settings", () => {
    MetabaseSettings.set("start-of-week", "wednesday");
    updateMomentStartOfWeek();

    setup();

    expect(
      screen
        .getAllByTestId("calendar-day-name")
        .map((dayEl, index) => dayEl.textContent),
    ).toEqual(["We", "Th", "Fr", "Sa", "Su", "Mo", "Tu"]);

    // check that dates listed start with proper day-of-week
    const startDate = moment().startOf("month").isoWeekday(3);
    const endDate = moment().endOf("month").isoWeekday(2);
    const days = [];
    while (startDate <= endDate) {
      days.push(startDate.date());
      startDate.add(1, "day");
    }

    expect(screen.getByTestId("calendar-weeks")).toHaveTextContent(
      new RegExp(days.join("")),
    );

    MetabaseSettings.set("start-of-week", "sunday"); // rollback to default
    updateMomentStartOfWeek();
  });
});

function setup() {
  const props: CalendarProps = {};

  return render(<Calendar {...props} />);
}
