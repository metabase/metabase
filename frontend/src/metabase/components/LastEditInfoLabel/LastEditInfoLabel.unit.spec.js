import mockDate from "mockdate";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import LastEditInfoLabel from "./LastEditInfoLabel";

describe("LastEditInfoLabel", () => {
  afterEach(() => {
    mockDate.reset();
  });

  const NOW_REAL = moment().toISOString();

  const TEST_USER = createMockUser({
    id: 2,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
  });

  function setup({ isLastEditedByCurrentUser = false } = {}) {
    const testItem = {
      "last-edit-info": {
        ...TEST_USER,
        timestamp: NOW_REAL,
      },
    };

    const currentUser = isLastEditedByCurrentUser
      ? TEST_USER
      : { ...TEST_USER, id: TEST_USER.id + 1 };

    return renderWithProviders(<LastEditInfoLabel item={testItem} />, {
      storeInitialState: {
        currentUser,
      },
    });
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
      setup();
      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        new RegExp(`Edited ${expectedTimestamp} by .*`, "i"),
      );
    });
  });

  it("should display last editor's name", () => {
    const { first_name, last_name } = TEST_USER;
    // Example: John Doe —> John D.
    const expectedName = `${first_name} ${last_name.charAt(0)}.`;

    setup();
    expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
      new RegExp(`Edited .* by ${expectedName}`),
    );
  });

  it("should display if user is the last editor", () => {
    setup({ isLastEditedByCurrentUser: true });
    expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
      new RegExp(`Edited .* by you`),
    );
  });
});
