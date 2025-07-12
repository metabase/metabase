import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";

import {
  createQuery,
  createQueryWithNumberFilter,
  findNumericColumn,
  storeInitialState,
} from "../test-utils";

import { NumberFilterPicker } from "./NumberFilterPicker";

const NUMERIC_TEST_CASES: Array<[string, number]> = [
  ["negative integer", -24],
  ["negative float", -17.32],
  ["zero", 0],
  ["positive float", 3.14],
  ["positive integer", 42],
];

const BETWEEN_TEST_CASES = [
  [-10.5, -10],
  [-10, 0],
  [0, 10],
  [10, 10.5],
  [-10, 10.5],
];

const EXPECTED_OPERATORS = [
  "Equal to",
  "Not equal to",
  "Range",
  "Is empty",
  "Not empty",
];

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  withAddButton?: boolean;
};

function setup({
  query = createQuery(),
  column = findNumericColumn(query),
  filter,
  withAddButton = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <NumberFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      isNew={!filter}
      withAddButton={withAddButton}
      onChange={onChange}
      onBack={onBack}
    />,
    { storeInitialState },
  );

  const getNextFilterParts = () => {
    const [filter] = onChange.mock.lastCall;
    return Lib.numberFilterParts(query, 0, filter);
  };

  const getNextFilterColumnName = () => {
    const parts = getNextFilterParts();
    const column = checkNotNull(parts?.column);
    return Lib.displayInfo(query, 0, column).longDisplayName;
  };

  const getNextFilterChangeOpts = () => {
    const [_filter, opts] = onChange.mock.lastCall;
    return opts;
  };

  return {
    query,
    column,
    getNextFilterParts,
    getNextFilterColumnName,
    getNextFilterChangeOpts,
    onChange,
    onBack,
  };
}

async function setOperator(operator: string) {
  await userEvent.click(screen.getByLabelText("Filter operator"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: operator }),
  );
}

describe("NumberFilterPicker", () => {
  describe("new filter", () => {
    it("should render a blank editor", () => {
      setup();

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("Range")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Start of range")).toHaveValue("");
      expect(screen.getByPlaceholderText("End of range")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();
    });

    it("should list operators", async () => {
      setup();

      await userEvent.click(screen.getByLabelText("Filter operator"));
      const menu = await screen.findByRole("menu");
      const menuItems = within(menu).getAllByRole("menuitem");

      expect(menuItems).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach((operatorName) =>
        expect(within(menu).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    describe("with one value", () => {
      it.each(NUMERIC_TEST_CASES)(
        "should add a filter with a %s value",
        async (_title, value) => {
          const { getNextFilterParts, getNextFilterColumnName } = setup();

          await setOperator("Range");
          await userEvent.type(
            screen.getByPlaceholderText("Start of range"),
            String(value),
          );
          await userEvent.click(screen.getByText("Add filter"));

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: ">",
            column: expect.anything(),
            values: [value],
          });
          expect(getNextFilterColumnName()).toBe("Total");
        },
      );

      it("should add a filter via keyboard", async () => {
        const { onChange, getNextFilterParts, getNextFilterColumnName } =
          setup();

        await setOperator("Range");
        const input = screen.getByPlaceholderText("Start of range");
        await userEvent.type(input, "{enter}");
        expect(onChange).not.toHaveBeenCalled();

        await userEvent.type(input, "15{enter}");
        expect(onChange).toHaveBeenCalled();
        expect(getNextFilterParts()).toMatchObject({
          operator: ">",
          column: expect.anything(),
          values: [15],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });

      it("should add a filter with a big integer value", async () => {
        const query = createQuery();
        const columns = Lib.filterableColumns(query, -1);
        const findColumn = columnFinder(query, columns);
        const column = findColumn("ORDERS", "ID");
        const { onChange, getNextFilterParts, getNextFilterColumnName } = setup(
          { query, column },
        );

        await setOperator("Range");
        const input = screen.getByPlaceholderText("Start of range");
        await userEvent.type(input, "9007199254740993{enter}");
        expect(onChange).toHaveBeenCalled();
        expect(getNextFilterParts()).toMatchObject({
          operator: ">",
          column: expect.anything(),
          values: [9007199254740993n],
        });
        expect(getNextFilterColumnName()).toBe("ID");
      });
    });

    describe("with two values", () => {
      it.each(BETWEEN_TEST_CASES)(
        "should add a filter with %i to %i values",
        async (leftValue, rightValue) => {
          const { getNextFilterParts, getNextFilterColumnName } = setup();
          const addFilterButton = screen.getByRole("button", {
            name: "Add filter",
          });

          await setOperator("Range");
          const leftInput = screen.getByPlaceholderText("Start of range");
          const rightInput = screen.getByPlaceholderText("End of range");
          await userEvent.type(leftInput, String(leftValue));
          await userEvent.type(rightInput, String(rightValue));
          await userEvent.click(addFilterButton);

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: "between",
            column: expect.anything(),
            values: [leftValue, rightValue],
          });
          expect(getNextFilterColumnName()).toBe("Total");
        },
      );

      it("should swap values when min > max", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup();
        const addFilterButton = screen.getByRole("button", {
          name: "Add filter",
        });

        await setOperator("Range");
        const leftInput = screen.getByPlaceholderText("Start of range");
        const rightInput = screen.getByPlaceholderText("End of range");
        await userEvent.type(leftInput, "5");
        await userEvent.type(rightInput, "-10.5");
        await userEvent.click(addFilterButton);

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [-10.5, 5],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });

      it("should add a filter via keyboard", async () => {
        const { onChange, getNextFilterParts, getNextFilterColumnName } =
          setup();

        await setOperator("Range");
        const leftInput = screen.getByPlaceholderText("Start of range");
        const rightInput = screen.getByPlaceholderText("End of range");
        await userEvent.type(leftInput, "5");
        await userEvent.type(rightInput, "-10.5{enter}");

        expect(onChange).toHaveBeenCalled();
        expect(getNextFilterParts()).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [-10.5, 5],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });
    });

    describe("with many values", () => {
      it("should add a filter with many values", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup();

        await userEvent.click(screen.getByText("Range"));
        await userEvent.click(screen.getByText("Equal to"));
        const input = screen.getByPlaceholderText("Enter a number");
        await userEvent.type(input, "-5");
        await userEvent.tab();
        await userEvent.type(input, "10");
        await userEvent.click(screen.getByText("Add filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "=",
          column: expect.anything(),
          values: [-5, 10],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });
    });

    describe("with no values", () => {
      it("should add a filter", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup();

        await setOperator("Is empty");
        await userEvent.click(screen.getByText("Add filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "is-null",
          column: expect.anything(),
          values: [],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });
    });

    it("should handle invalid input", async () => {
      setup();

      await userEvent.click(screen.getByText("Range"));
      await userEvent.click(screen.getByText("Equal to"));
      await userEvent.type(
        screen.getByPlaceholderText("Enter a number"),
        "Twenty four",
      );

      expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();
    });

    it("should go back", async () => {
      const { onBack, onChange } = setup();
      await userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it.each([
      { label: "Apply filter", run: true },
      { label: "Add another filter", run: false },
    ])(
      'should add a filter via the "$label" button when the add button is enabled',
      async ({ label, run }) => {
        const { getNextFilterChangeOpts } = setup({ withAddButton: true });
        await setOperator("Range");
        const input = screen.getByPlaceholderText("Start of range");
        await userEvent.type(input, "15");
        await userEvent.click(screen.getByRole("button", { name: label }));
        expect(getNextFilterChangeOpts()).toMatchObject({ run });
      },
    );
  });

  describe("existing filter", () => {
    describe("with one value", () => {
      it.each(NUMERIC_TEST_CASES)(
        "should render a filter with a %s value",
        (_title, value) => {
          setup(
            createQueryWithNumberFilter({
              operator: ">",
              values: [value],
            }),
          );

          expect(screen.getByText("Total")).toBeInTheDocument();
          expect(screen.getByDisplayValue(String(value))).toBeInTheDocument();
          expect(screen.getByText("Update filter")).toBeEnabled();
        },
      );

      it.each(NUMERIC_TEST_CASES)(
        "should update a filter with a %s value",
        async (_title, value) => {
          const { getNextFilterParts, getNextFilterColumnName } = setup(
            createQueryWithNumberFilter({
              operator: ">",
              values: [1000],
            }),
          );

          const input = screen.getByPlaceholderText("Start of range");
          await setOperator("Range");
          await userEvent.clear(input);
          await userEvent.type(input, `${value}`);
          await userEvent.click(screen.getByText("Update filter"));

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: ">",
            column: expect.anything(),
            values: [value],
          });
          expect(getNextFilterColumnName()).toBe("Total");
        },
      );
    });

    describe("with two values", () => {
      it.each(BETWEEN_TEST_CASES)(
        "should render a filter with %i to %i values",
        (leftValue, rightValue) => {
          setup(
            createQueryWithNumberFilter({
              operator: "between",
              values: [leftValue, rightValue],
            }),
          );

          expect(screen.getByText("Total")).toBeInTheDocument();
          expect(screen.getByText("Range")).toBeInTheDocument();
          expect(
            screen.getByDisplayValue(String(leftValue)),
          ).toBeInTheDocument();
          expect(
            screen.getByDisplayValue(String(rightValue)),
          ).toBeInTheDocument();
          expect(screen.getByText("Update filter")).toBeEnabled();
        },
      );

      it.each(BETWEEN_TEST_CASES)(
        "should update a filter with %i to %i values",
        async (leftValue, rightValue) => {
          const { getNextFilterParts, getNextFilterColumnName } = setup(
            createQueryWithNumberFilter({
              operator: "between",
              values: [0, 1000],
            }),
          );
          const updateButton = screen.getByRole("button", {
            name: "Update filter",
          });

          await setOperator("Range");
          const leftInput = screen.getByPlaceholderText("Start of range");
          const rightInput = screen.getByPlaceholderText("End of range");
          await userEvent.clear(leftInput);
          await userEvent.type(leftInput, `${leftValue}`);
          expect(updateButton).toBeEnabled();

          await userEvent.clear(rightInput);
          await userEvent.type(rightInput, `${rightValue}`);
          await userEvent.click(updateButton);

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: "between",
            column: expect.anything(),
            values: [leftValue, rightValue],
          });
          expect(getNextFilterColumnName()).toBe("Total");
        },
      );
    });

    describe("with many values", () => {
      it("should update a filter with many values", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createQueryWithNumberFilter({ operator: "=", values: [1, 2] }),
        );

        await userEvent.type(screen.getByLabelText("Filter value"), "3");
        await userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "=",
          column: expect.anything(),
          values: [1, 2, 3],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });
    });

    describe("without a value", () => {
      it("should render a filter with no values", () => {
        setup(
          createQueryWithNumberFilter({ operator: "not-null", values: [] }),
        );

        expect(screen.getByText("Total")).toBeInTheDocument();
        expect(screen.getByText("Not empty")).toBeInTheDocument();
        expect(screen.getByText("Update filter")).toBeEnabled();
      });

      it("should update a filter with no values", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createQueryWithNumberFilter({ operator: "not-null", values: [] }),
        );

        await setOperator("Is empty");
        await userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "is-null",
          column: expect.anything(),
          values: [],
        });
        expect(getNextFilterColumnName()).toBe("Total");
      });
    });

    it("should list operators", async () => {
      setup(createQueryWithNumberFilter({ operator: "<" }));

      await userEvent.click(screen.getByText("Range"));
      const menu = await screen.findByRole("menu");
      const menuItems = within(menu).getAllByRole("menuitem");

      expect(menuItems).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach((operatorName) =>
        expect(within(menu).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should change an operator", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup(
        createQueryWithNumberFilter({
          operator: "<",
          values: [11],
        }),
      );

      await setOperator("Range");
      await userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "<=",
        column: expect.anything(),
        values: [11],
      });
      expect(getNextFilterColumnName()).toBe("Total");
    });

    it("should re-use values when changing an operator", async () => {
      setup(createQueryWithNumberFilter({ operator: "=", values: [10, 20] }));
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();

      await setOperator("Not equal to");

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Range");

      expect(screen.getByDisplayValue("10")).toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Is empty");

      expect(screen.queryByText("10")).not.toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Equal to");

      expect(screen.queryByText("10")).not.toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeDisabled();
    });

    it("should go back", async () => {
      const { onBack, onChange } = setup(createQueryWithNumberFilter());
      await userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("between filter", () => {
    it("should change inclusiveness on click and keypress", async () => {
      setup(createQueryWithNumberFilter({ operator: "between" }));

      const greaterButton = screen.getByRole("button", {
        name: /toggle greater inclusiveness/,
      });
      const lessButton = screen.getByRole("button", {
        name: /toggle less inclusiveness/,
      });

      expect(greaterButton).toBeInTheDocument();
      expect(lessButton).toBeInTheDocument();

      expect(getIcon("greater_than_or_equal")).toBeInTheDocument();

      await userEvent.click(greaterButton);

      expect(getIcon("greater_than")).toBeInTheDocument();

      expect(getIcon("less_than_or_equal")).toBeInTheDocument();

      await userEvent.click(lessButton);

      expect(getIcon("less_than")).toBeInTheDocument();

      await userEvent.click(lessButton);
      await userEvent.click(greaterButton);

      expect(getIcon("greater_than_or_equal")).toBeInTheDocument();
      expect(getIcon("less_than_or_equal")).toBeInTheDocument();
    });
  });
});
