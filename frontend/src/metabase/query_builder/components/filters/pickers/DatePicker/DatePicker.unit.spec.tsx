import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ORDERS } from "__support__/sample_database_fixture";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import DatePicker from "./DatePicker";

const user = userEvent.setup({ delay: null });
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

        await user.click(screen.getByText(new RegExp(type, "i")));
        await screen.findByTestId(`${type}-date-picker`);
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

          await user.click(screen.getByText(new RegExp(label, "i")));
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
          await user.click(screen.getByText(/specific dates/i));
          await screen.findByTestId(`specific-date-picker`);
          await user.click(screen.getByText(new RegExp(description, "i")));
          const dateField = screen.getByText("21");
          await user.click(dateField);

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

        await user.click(await screen.findByText(/specific/i));
        await user.click(await screen.findByText(/between/i));

        const dateField1 = screen.getByText("17");
        const dateField2 = screen.getByText("19");

        await user.click(dateField1); // end range
        await user.click(dateField1); // begin range, clears end range
        await user.click(dateField2); // end range

        expect(changeSpy).toHaveBeenLastCalledWith([
          "between",
          CREATED_AT_FIELD,
          "2020-05-17",
          "2020-05-19",
        ]);
      });

      it("can navigate between months on the calendar using arrows", async () => {
        render(<DatePickerStateWrapper filter={filter} />);
        await user.click(screen.getByText(/specific/i));

        await screen.findByText("May 2020");
        await user.click(screen.getByLabelText(/chevronright/i));
        await screen.findByText("June 2020");
        await user.click(screen.getByLabelText(/chevronright/i));
        await screen.findByText("July 2020");
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
            await user.click(screen.getByText(/relative dates/i));
            await user.click(screen.getByText(new RegExp(direction, "i")));

            const valueInput = await screen.findByTestId(
              "relative-datetime-value",
            );
            await user.clear(valueInput);
            await user.type(valueInput, String(relativeTimeValue));

            await user.click(
              await screen.findByTestId("relative-datetime-unit"),
            );
            await user.click(await screen.findByText(new RegExp(unit, "i")));

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
          await user.click(screen.getByText(/relative dates/i));
          await user.click(screen.getByText(/current/i));
          await user.click(screen.getByText(new RegExp(unit, "i")));

          expect(commitSpy).toHaveBeenLastCalledWith([
            "time-interval",
            CREATED_AT_FIELD,
            "current",
            unit,
          ]);
        });
      });
    });
  });
});
