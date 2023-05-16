import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ORDERS } from "__support__/sample_database_fixture";
import Filter from "metabase-lib/queries/structured/Filter";

import DatePicker from "./DatePicker";

const ordersQuery = ORDERS.query();

// this component does not manage its own filter state, so we need a wrapper to test
// any state updates because the component's behavior is based on the filter state
const DatePickerStateWrapper = ({
  filter,
  onCommit = jest.fn(),
  onChange = jest.fn(),
}: {
  filter: Filter;
  onCommit?: (arg: any) => void;
  onChange?: (arg: any) => void;
}) => {
  const [filterValue, setFilterValue] = useState(filter);
  return (
    <DatePicker
      filter={filterValue}
      onFilterChange={(arg: any) => {
        setFilterValue(arg);
        onChange(arg);
      }}
      onCommit={onCommit}
    />
  );
};

const CREATED_AT_FIELD = ORDERS.CREATED_AT.reference();

const createDateFilter = (operator: null | string = null, ...args: any[]) =>
  new Filter([operator, CREATED_AT_FIELD, ...(args ?? [])], null, ordersQuery);

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
      const filter = createDateFilter();

      render(
        <DatePicker
          filter={filter}
          onFilterChange={dummyFunction}
          onCommit={dummyFunction}
        />,
      );

      expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    });

    it("shows a date shortcut picker for an empty filter", () => {
      const filter = createDateFilter();

      render(
        <DatePicker
          filter={filter}
          onFilterChange={dummyFunction}
          onCommit={dummyFunction}
        />,
      );

      expect(screen.getByTestId("date-picker-shortcuts")).toBeInTheDocument();
    });

    describe("Specific Dates", () => {
      const singleDateOperators = ["=", "<", ">"];

      singleDateOperators.forEach(operator => {
        it(`shows a single specific date picker for a ${operator} operator`, () => {
          const filter = createDateFilter(operator, "2020-01-01");

          render(
            <DatePicker
              filter={filter}
              onFilterChange={dummyFunction}
              onCommit={dummyFunction}
            />,
          );

          expect(
            screen.getByTestId("specific-date-picker"),
          ).toBeInTheDocument();
        });
      });

      it("shows a between date picker when the existing filter is 'between'", () => {
        const filter = createDateFilter("between", "2020-01-01", "2020-01-05");

        render(
          <DatePicker
            filter={filter}
            onFilterChange={dummyFunction}
            onCommit={dummyFunction}
          />,
        );

        expect(screen.getByTestId("between-date-picker")).toBeInTheDocument();
      });
    });

    describe("Relative Dates", () => {
      const relativeTimeValues = [2, -2];
      const relativeTimeUnits = ["day", "week", "month", "quarter", "year"];

      relativeTimeValues.forEach(value => {
        relativeTimeUnits.forEach(unit => {
          it(`shows a relative picker for a ${value} ${unit} time interval`, () => {
            const filter = createDateFilter("time-interval", value, unit);

            render(
              <DatePicker
                filter={filter}
                onFilterChange={dummyFunction}
                onCommit={dummyFunction}
              />,
            );

            expect(
              screen.getByTestId("relative-date-picker"),
            ).toBeInTheDocument();
          });
        });
      });

      relativeTimeUnits.forEach(unit => {
        it(`shows a current time picker for the current ${unit}`, () => {
          const filter = createDateFilter("time-interval", "current", unit);

          render(
            <DatePicker
              filter={filter}
              onFilterChange={dummyFunction}
              onCommit={dummyFunction}
            />,
          );

          expect(screen.getByTestId("current-date-picker")).toBeInTheDocument();
        });
      });
    });
  });

  describe("User Interaction", () => {
    const datePickerTypes = ["specific", "relative", "exclude"];

    const filter = createDateFilter();

    datePickerTypes.forEach(type => {
      it(`shows a ${type} date picker when the user clicks ${type} on the shortcut screen`, async () => {
        render(<DatePickerStateWrapper filter={filter} />);

        userEvent.click(screen.getByText(new RegExp(type, "i")));

        expect(
          (await screen.findAllByTestId(`${type}-date-picker`)).length,
        ).not.toBe(0);
      });
    });

    describe("Date Shortcuts", () => {
      const shortcuts: [string, any[]][] = [
        [
          "Today",
          [
            "time-interval",
            CREATED_AT_FIELD,
            "current",
            "day",
            { include_current: true },
          ],
        ],
        [
          "Last 7 days",
          [
            "time-interval",
            CREATED_AT_FIELD,
            -7,
            "day",
            { include_current: false },
          ],
        ],
        [
          "Last 12 Months",
          [
            "time-interval",
            CREATED_AT_FIELD,
            -12,
            "month",
            { include_current: false },
          ],
        ],
      ];

      shortcuts.forEach(([label, expectedFilter]: [string, any[]]) => {
        it(`applies the correct filter for the ${label} shortcut`, async () => {
          const commitSpy = jest.fn();

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

          render(
            <DatePickerStateWrapper filter={filter} onChange={changeSpy} />,
          );
          userEvent.click(screen.getByText(/specific dates/i));
          userEvent.click(screen.getByText("On"));
          await screen.findByTestId(`specific-date-picker`);
          userEvent.click(screen.getByText(new RegExp(description, "i")));
          const dateField = screen.getByText("21");
          userEvent.click(dateField);

          expect(changeSpy).toHaveBeenLastCalledWith([
            operator,
            CREATED_AT_FIELD,
            "2020-05-21",
          ]);
        });
      });

      it("can set a between date filter", async () => {
        const changeSpy = jest.fn();

        render(<DatePickerStateWrapper filter={filter} onChange={changeSpy} />);

        userEvent.click(await screen.findByText(/specific/i));
        userEvent.click(await screen.findByText(/between/i));

        const dateField1 = screen.getByText("17");
        const dateField2 = screen.getByText("19");

        userEvent.click(dateField1); // begin range, clears end range
        userEvent.click(dateField2); // end range

        expect(changeSpy).toHaveBeenLastCalledWith([
          "between",
          CREATED_AT_FIELD,
          "2020-05-17",
          "2020-05-19",
        ]);
      });

      it("can navigate between months on the calendar using arrows", async () => {
        render(<DatePickerStateWrapper filter={filter} />);
        userEvent.click(screen.getByText(/specific/i));
        userEvent.click(screen.getByText("On"));

        expect(await screen.findByText("May 2020")).toBeInTheDocument();
        userEvent.click(screen.getByLabelText(/chevronright/i));
        expect(await screen.findByText("June 2020")).toBeInTheDocument();
        userEvent.click(screen.getByLabelText(/chevronright/i));
        expect(await screen.findByText("July 2020")).toBeInTheDocument();
      });
    });

    describe("Relative Dates", () => {
      const relativeTimeUnits = [
        "minutes",
        "hours",
        "weeks",
        "months",
        "quarters",
        "years",
      ];
      const relativeTimeDirection = ["past", "next"];
      const relativeTimeValue = 4;

      relativeTimeDirection.forEach(direction => {
        relativeTimeUnits.forEach(unit => {
          it(`can set a relative ${direction} ${unit} filter`, async () => {
            const changeSpy = jest.fn();

            render(
              <DatePickerStateWrapper filter={filter} onChange={changeSpy} />,
            );
            userEvent.click(screen.getByText(/relative dates/i));
            userEvent.click(screen.getByText(new RegExp(direction, "i")));

            const valueInput = await screen.findByTestId(
              "relative-datetime-value",
            );
            userEvent.clear(valueInput);
            userEvent.type(valueInput, String(relativeTimeValue));

            userEvent.click(
              await screen.findByTestId("relative-datetime-unit"),
            );
            userEvent.click(await screen.findByText(new RegExp(unit, "i")));

            expect(changeSpy).toHaveBeenLastCalledWith([
              "time-interval",
              ["field", ORDERS.CREATED_AT.id, null],
              (direction === "past" ? -1 : 1) * relativeTimeValue,
              unit.slice(0, -1), // without the 's'
            ]);
          });
        });
      });

      // not tested: relative times starting from X units ago or X units from now
      // jest can't seem to open the popover on click

      const currentTimeUnits = ["day", "week", "month", "quarter", "year"];

      currentTimeUnits.forEach(unit => {
        it(`can set a current ${unit} filter`, async () => {
          const commitSpy = jest.fn();

          render(
            <DatePickerStateWrapper filter={filter} onCommit={commitSpy} />,
          );
          userEvent.click(screen.getByText(/relative dates/i));
          userEvent.click(screen.getByText(/current/i));
          userEvent.click(screen.getByText(new RegExp(unit, "i")));

          expect(commitSpy).toHaveBeenLastCalledWith([
            "time-interval",
            CREATED_AT_FIELD,
            "current",
            unit,
          ]);
        });
      });
    });

    describe("Exclude", () => {
      it("should correctly update exclude filter when value is 0 even though it is falsy", async () => {
        const onChangeMock = jest.fn();

        render(
          <DatePickerStateWrapper filter={filter} onChange={onChangeMock} />,
        );

        userEvent.click(screen.getByText("Exclude..."));
        userEvent.click(screen.getByText("Hours of the day..."));

        const midnightCheckbox = screen.getByRole("checkbox", {
          name: /12 AM/i,
        });

        expect(midnightCheckbox).toBeChecked();

        userEvent.click(midnightCheckbox);

        expect(onChangeMock).toHaveBeenCalledWith([
          "!=",
          ["field", 1, { "temporal-unit": "hour-of-day" }],
          0,
        ]);

        expect(midnightCheckbox).not.toBeChecked();
      });
    });
  });
});
