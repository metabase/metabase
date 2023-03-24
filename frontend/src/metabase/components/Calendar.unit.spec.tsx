import React from "react";
import { render, screen } from "__support__/ui";
import MetabaseSettings from "metabase/lib/settings";
import { updateMomentStartOfWeek } from "metabase/lib/i18n";
import Calendar from "./Calendar";

describe("Calendar", () => {
  it("should render weekday short names", () => {
    setup();

    expect(
      screen
        .getAllByTestId("calendar-day-name")
        .map(dayEl => dayEl.textContent),
    ).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });

  describe('with custom "start-of-week" setting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2023-03-23T08:00:00"));

      MetabaseSettings.set("start-of-week", "wednesday");
      updateMomentStartOfWeek();
    });

    afterEach(() => {
      MetabaseSettings.set("start-of-week", "sunday"); // rollback to default
      updateMomentStartOfWeek();

      jest.useRealTimers();
    });

    it("should render days based on first day of the week settings", () => {
      setup();

      expect(
        screen
          .getAllByTestId("calendar-day-name")
          .map((dayEl, index) => dayEl.textContent),
      ).toEqual(["We", "Th", "Fr", "Sa", "Su", "Mo", "Tu"]);

      // check that listed dates are correct and start with proper day-of-week
      expect(screen.getByTestId("calendar-weeks")).toHaveTextContent(
        [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
          21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4,
        ].join(""), // days in March 2023 + days of the first week of April until Wednesday (not including it)
      );
    });
  });
});

function setup() {
  return render(<Calendar />);
}
