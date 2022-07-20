// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { ORDERS } from "__support__/sample_database_fixture";

import Filter from "metabase-lib/lib/queries/structured/Filter";

import DatePicker from "./DatePicker";
import { DATE_SHORTCUT_OPTIONS } from "./DatePickerShortcutOptions";
import { act } from "react-dom/test-utils";

const ordersQuery = ORDERS.query();

// this component does not manage its own filter state, so we need a wrapper to test
// any state updates because the component's behavior is based on the filter state
const DatePickerStateWrapper = ({
  filter,
  onCommit = jest.fn(),
  onChange = jest.fn(),
}: {
  filter: Filter;
  onCommit: () => void;
  onChange: () => void;
}) => {
  const [filterValue, setFilterValue] = useState(filter);
  return (
    <DatePicker
      filter={filterValue}
      onFilterChange={arg => {
        setFilterValue(arg);
        onChange(arg);
      }}
      onCommit={onCommit}
    />
  );
};

describe("DatePicker", () => {
  beforeAll(() => {
    // this should keep these tests from behaving differently when run in the future
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2020-05-01 08:00:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const dummyFunction = jest.fn();

  describe("Static States", () => {
    it("renders a date picker component", () => {
      const filter = new Filter(
        [null, ["field", ORDERS.CREATED_AT.id, null]],
        null,
        ordersQuery,
      );

      render(
        <DatePicker
          filter={filter}
          onFilterChange={dummyFunction}
          onCommit={dummyFunction}
        />,
      );

      screen.getByTestId("date-picker");
    });

    it("shows a date shortcut picker for an empty filter", () => {
      const filter = new Filter(
        [null, ["field", ORDERS.CREATED_AT.id, null]],
        null,
        ordersQuery,
      );

      render(
        <DatePicker
          filter={filter}
          onFilterChange={dummyFunction}
          onCommit={dummyFunction}
        />,
      );

      screen.getByTestId("date-picker-shortcuts");
    });

    describe("Specific Dates", () => {
      const singleDateOperators = ["=", "<", ">"];

      singleDateOperators.forEach(operator => {
        it(`shows a single specific date picker for a ${operator} operator`, () => {
          const filter = new Filter(
            [operator, ["field", ORDERS.CREATED_AT.id, null], "2020-01-01"],
            null,
            ordersQuery,
          );
          render(
            <DatePicker
              filter={filter}
              onFilterChange={dummyFunction}
              onCommit={dummyFunction}
            />,
          );

          screen.getByTestId("specific-date-picker");
        });
      });

      it("shows a between date picker when the existing filter is 'between'", () => {
        const filter = new Filter(
          [
            "between",
            ["field", ORDERS.CREATED_AT.id, null],
            "2020-01-01",
            "2020-01-05",
          ],
          null,
          ordersQuery,
        );
        render(
          <DatePicker
            filter={filter}
            onFilterChange={dummyFunction}
            onCommit={dummyFunction}
          />,
        );

        screen.getByTestId("between-date-picker");
      });
    });

    describe("Relative Dates", () => {
      const relativeTimeValues = [2, -2];
      const relativeTimeUnits = ["day", "week", "month", "quarter", "year"];

      relativeTimeValues.forEach(value => {
        relativeTimeUnits.forEach(unit => {
          it(`shows a relative picker for a ${value} ${unit} time interval`, () => {
            const filter = new Filter(
              [
                "time-interval",
                ["field", ORDERS.CREATED_AT.id, null],
                value,
                unit,
              ],
              null,
              ordersQuery,
            );
            render(
              <DatePicker
                filter={filter}
                onFilterChange={dummyFunction}
                onCommit={dummyFunction}
              />,
            );

            screen.getByTestId("relative-date-picker");
          });
        });
      });

      relativeTimeUnits.forEach(unit => {
        it(`shows a current time picker for the current ${unit}`, () => {
          const filter = new Filter(
            [
              "time-interval",
              ["field", ORDERS.CREATED_AT.id, null],
              "current",
              unit,
            ],
            null,
            ordersQuery,
          );
          render(
            <DatePicker
              filter={filter}
              onFilterChange={dummyFunction}
              onCommit={dummyFunction}
            />,
          );

          screen.getByTestId("current-date-picker");
        });
      });
    });
  });

  describe("User Interaction", () => {
    const datePickerTypes = ["specific", "relative", "exclude"];
    datePickerTypes.forEach(type => {
      it(`shows a ${type} date picker when the user clicks ${type} on the shortcut screen`, async () => {
        const filter = new Filter(
          [null, ["field", ORDERS.CREATED_AT.id, null]],
          null,
          ordersQuery,
        );

        render(<DatePickerStateWrapper filter={filter} />);

        userEvent.click(screen.getByText(new RegExp(type, "i")));
        await screen.findByTestId(`${type}-date-picker`);
      });
    });

    describe("Date Shortcuts", () => {
      const shortcuts = [
        [
          "Today",
          [
            "time-interval",
            ["field", ORDERS.CREATED_AT.id, null],
            "current",
            "day",
            { include_current: true },
          ],
        ],
        [
          "Last 7 days",
          [
            "time-interval",
            ["field", ORDERS.CREATED_AT.id, null],
            -7,
            "day",
            { include_current: false },
          ],
        ],
        [
          "Last 12 Months",
          [
            "time-interval",
            ["field", ORDERS.CREATED_AT.id, null],
            -12,
            "month",
            { include_current: false },
          ],
        ],
      ];

      shortcuts.forEach(([label, expectedFilter]) => {
        it(`applies the correct filter for the ${label} shortcut`, async () => {
          const commitSpy = jest.fn();
          const filter = new Filter(
            [null, ["field", ORDERS.CREATED_AT.id, null]],
            null,
            ordersQuery,
          );

          render(
            <DatePickerStateWrapper filter={filter} onCommit={commitSpy} />,
          );

          userEvent.click(screen.getByText(new RegExp(label, "i")));
          expect(commitSpy).toHaveBeenCalledWith(expectedFilter);
        });
      });
    });

    describe("Specific Dates", () => {
      const singleDateOperators = [
        ["=", "on"],
        ["<", "before"],
        [">", "after"],
      ];

      singleDateOperators.forEach(([operator, description]) => {
        it(`can set a specific ${description} date filter`, async () => {
          const changeSpy = jest.fn();
          const filter = new Filter(
            [null, ["field", ORDERS.CREATED_AT.id, null]],
            null,
            ordersQuery,
          );

          render(
            <DatePickerStateWrapper filter={filter} onChange={changeSpy} />,
          );
          userEvent.click(screen.getByText(/specific dates/i));
          await screen.findByTestId(`specific-date-picker`);
          userEvent.click(screen.getByText(new RegExp(description, "i")));
          const dateField = screen.getByText("21");
          userEvent.click(dateField);

          const [newOperator, , newDate] =
            changeSpy.mock.calls[changeSpy.mock.calls.length - 1][0];
          expect(newOperator).toBe(operator);
          expect(newDate).toBe("2020-05-21");
        });
      });

      it("can set a between date filter", async () => {
        const changeSpy = jest.fn();
        const filter = new Filter(
          [null, ["field", ORDERS.CREATED_AT.id, null]],
          null,
          ordersQuery,
        );

        render(<DatePickerStateWrapper filter={filter} onChange={changeSpy} />);

        userEvent.click(screen.getByText(/specific/i));
        userEvent.click(await screen.findByText(/between/i));

        const dateField1 = screen.getByText("17");
        const dateField2 = screen.getByText("19");

        userEvent.click(dateField1); // end range
        userEvent.click(dateField1); // begin range, clears end range
        userEvent.click(dateField2); // end range

        const [operator, , startDate, endDate] =
          changeSpy.mock.calls[changeSpy.mock.calls.length - 1][0];
        expect(operator).toBe("between");
        expect(startDate).toBe("2020-05-17");
        expect(endDate).toBe("2020-05-19");
      });

      it("can navigate between months on the calendar using arrows", async () => {
        const filter = new Filter(
          [null, ["field", ORDERS.CREATED_AT.id, null]],
          null,
          ordersQuery,
        );

        render(<DatePickerStateWrapper filter={filter} />);
        userEvent.click(screen.getByText(/specific/i));

        await screen.findByText("May 2020");
        userEvent.click(await screen.getByLabelText(/chevronright/i));
        await screen.findByText("June 2020");
        userEvent.click(await screen.getByLabelText(/chevronright/i));
        await screen.findByText("July 2020");
      });
    });

    describe("Relative Dates", () => {
      const relativeTimeUnits = ["minutes"]; //, 'hours', 'weeks', 'months', 'quarters', 'years'];
      const relativeTimeDirection = ["past", "next"];
      const relativeTimeValue = 4;

      relativeTimeDirection.forEach(direction => {
        relativeTimeUnits.forEach(unit => {
          it(`can set a relative ${direction} ${unit} filter`, async () => {
            const changeSpy = jest.fn();
            const filter = new Filter(
              [null, ["field", ORDERS.CREATED_AT.id, null]],
              null,
              ordersQuery,
            );

            render(
              <DatePickerStateWrapper filter={filter} onChange={changeSpy} />,
            );
            userEvent.click(screen.getByText(/relative dates/i));
            userEvent.click(screen.getByText(new RegExp(direction, "i")));

            const valueInput = await screen.findByTestId(
              "relative-datetime-value",
            );
            userEvent.clear(valueInput);
            fireEvent.change(valueInput, {
              target: { value: relativeTimeValue },
            });

            userEvent.click(
              await screen.findByTestId("relative-datetime-unit"),
            );
            userEvent.click(await screen.findByText(new RegExp(unit, "i")));

            const [operator, , filterValue, filterUnit] =
              changeSpy.mock.calls[changeSpy.mock.calls.length - 1][0];
            expect(operator).toBe(`time-interval`);
            expect(filterUnit + "s").toBe(unit);
            expect(filterValue).toBe(
              (direction === "past" ? -1 : 1) * relativeTimeValue,
            );
          });
        });
      });

      // not tested: relative times starting from X units ago or X units from now
      // jest can't seem to open the popover on click

      const currentTimeUnits = ["day", "week", "month", "quarter", "year"];

      currentTimeUnits.forEach(unit => {
        it(`can set a current ${unit} filter`, async () => {
          const commitSpy = jest.fn();
          const filter = new Filter(
            [null, ["field", ORDERS.CREATED_AT.id, null]],
            null,
            ordersQuery,
          );

          render(
            <DatePickerStateWrapper filter={filter} onCommit={commitSpy} />,
          );
          userEvent.click(screen.getByText(/relative dates/i));
          userEvent.click(screen.getByText(/current/i));
          userEvent.click(screen.getByText(new RegExp(unit, "i")));

          const [operator, , filterValue, filterUnit] =
            commitSpy.mock.calls[commitSpy.mock.calls.length - 1][0];
          expect(operator).toBe(`time-interval`);
          expect(filterValue).toBe("current");
          expect(filterUnit).toBe(unit);
        });
      });
    });
  });
});
