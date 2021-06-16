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

  const TEST_USER = {
    id: 2,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
  };

  function setup({ isLastEditedByCurrentUser = false } = {}) {
    const testItem = {
      "last-edit-info": {
        ...TEST_USER,
        timestamp: NOW_REAL,
      },
    };

    function userReducer() {
      return isLastEditedByCurrentUser ? TEST_USER : { id: TEST_USER.id + 1 };
    }

    const store = getStore({ currentUser: userReducer });

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

  it("should display last editor's name", () => {
    const { first_name, last_name } = TEST_USER;
    // Example: John Doe —> John D.
    const expectedName = `${first_name} ${last_name.charAt(0)}.`;

    const { getByTestId } = setup();
    expect(getByTestId("label")).toHaveTextContent(
      new RegExp(`Edited .* by ${expectedName}`),
    );
  });

  it("should display if user is the last editor", () => {
    const { getByTestId } = setup({ isLastEditedByCurrentUser: true });
    expect(getByTestId("label")).toHaveTextContent(
      new RegExp(`Edited .* by you`),
    );
  });
});
