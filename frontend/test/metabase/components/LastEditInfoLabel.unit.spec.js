import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import mockDate from "mockdate";

import moment from "moment";
import { Provider } from "react-redux";
import { getStore } from "metabase/store";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";

describe("LastEditInfoLabel", () => {
  afterEach(() => {
    mockDate.reset();
  });

  const NOW_REAL = moment().toISOString();

  const store = getStore({ currentUser: () => ({ id: 1 }) });

  const FAKE_EDITOR = {
    id: 2,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
  };

  function setup() {
    const testItem = {
      "last-edit-info": {
        ...FAKE_EDITOR,
        timestamp: NOW_REAL,
      },
    };
    return render(
      <Provider store={store}>
        <LastEditInfoLabel item={testItem} data-testid="label" />
      </Provider>,
    );
  }

  const A_FEW_SECONDS_AGO = moment().add(5, "seconds");
  const IN_15_MIN = moment().add(15, "minutes");
  const IN_HOUR = moment().add(1, "hours");
  const IN_4_HOURS = moment().add(4, "hours");
  const TOMORROW = moment().add(1, "days");
  const IN_THREE_DAYS = moment().add(3, "days");
  const NEXT_WEEK = moment().add(1, "week");
  const NEXT_MONTH = moment().add(1, "month");
  const IN_4_MONTHS = moment().add(4, "month");
  const NEXT_YEAR = moment().add(1, "year");

  const testCases = [
    {
      date: A_FEW_SECONDS_AGO,
      expectedTimestamp: "a few seconds ago",
    },
    { date: IN_15_MIN, expectedTimestamp: "15 minutes ago" },
    { date: IN_HOUR, expectedTimestamp: "an hour ago" },
    { date: IN_4_HOURS, expectedTimestamp: "4 hours ago" },
    { date: TOMORROW, expectedTimestamp: "a day ago" },
    { date: IN_THREE_DAYS, expectedTimestamp: "3 days ago" },
    { date: NEXT_WEEK, expectedTimestamp: "7 days ago" },
    { date: NEXT_MONTH, expectedTimestamp: "a month ago" },
    { date: IN_4_MONTHS, expectedTimestamp: "4 months ago" },
    { date: NEXT_YEAR, expectedTimestamp: "a year ago" },
  ];

  testCases.forEach(({ date, expectedTimestamp }) => {
    it(`should display "${expectedTimestamp}" timestamp correctly`, () => {
      mockDate.set(date.toDate(), 0);
      const { getByTestId } = setup();
      expect(getByTestId("label")).toHaveTextContent(
        new RegExp(`Edited ${expectedTimestamp} by .*`, "i"),
      );
    });
  });
});
