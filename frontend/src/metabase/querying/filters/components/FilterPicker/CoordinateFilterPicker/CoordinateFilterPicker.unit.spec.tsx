import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import {
  createQuery,
  createQueryWithCoordinateFilter,
  findLatitudeColumn,
  findLongitudeColumn,
  storeInitialState,
} from "../test-utils";

import { CoordinateFilterPicker } from "./CoordinateFilterPicker";

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
  "Is",
  "Is not",
  "Inside",
  "Between",
  "Greater than",
  "Greater than or equal to",
  "Less than",
  "Less than or equal to",
];

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

function setup({
  query = createQuery(),
  column = findLatitudeColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <CoordinateFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      isNew={!filter}
      onChange={onChange}
      onBack={onBack}
    />,
    { storeInitialState },
  );

  function getNextFilterParts() {
    const [filter] = onChange.mock.lastCall;
    return Lib.coordinateFilterParts(query, 0, filter);
  }

  function getNextFilterColumnNames() {
    const parts = getNextFilterParts();
    const column = checkNotNull(parts?.column);
    const longitudeColumn = parts?.longitudeColumn;
    return {
      column: Lib.displayInfo(query, 0, column).longDisplayName,
      longitudeColumn: longitudeColumn
        ? Lib.displayInfo(query, 0, longitudeColumn).longDisplayName
        : null,
    };
  }

  return {
    query,
    column,
    getNextFilterParts,
    getNextFilterColumnNames,
    onChange,
    onBack,
  };
}

async function setOperator(operator: string) {
  await userEvent.click(screen.getByLabelText("Filter operator"));
  await userEvent.click(await screen.findByText(operator));
}

describe("CoordinateFilterPicker", () => {
  describe("new filter", () => {
    it("should render a blank editor", () => {
      setup();

      expect(screen.getByText("User → Latitude")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Between")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Min")).toHaveValue("");
      expect(screen.getByPlaceholderText("Max")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();
    });

    it("should list operators", async () => {
      setup();

      await userEvent.click(screen.getByLabelText("Filter operator"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    describe("with one value", () => {
      it.each(NUMERIC_TEST_CASES)(
        "should add a filter with a %s value",
        async (title, value) => {
          const { getNextFilterParts, getNextFilterColumnNames } = setup();

          await setOperator("Less than");
          await userEvent.type(
            screen.getByPlaceholderText("Enter a number"),
            String(value),
          );
          await userEvent.click(screen.getByText("Add filter"));

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: "<",
            values: [value],
            column: expect.anything(),
          });
          expect(getNextFilterColumnNames().column).toBe("User → Latitude");
        },
      );

      it("should add a filter via keyboard", async () => {
        const { onChange, getNextFilterParts, getNextFilterColumnNames } =
          setup();

        await setOperator("Greater than");
        const input = screen.getByPlaceholderText("Enter a number");
        await userEvent.type(input, "{enter}");
        expect(onChange).not.toHaveBeenCalled();

        await userEvent.type(input, "15{enter}");
        expect(onChange).toHaveBeenCalled();
        expect(getNextFilterParts()).toMatchObject({
          operator: ">",
          column: expect.anything(),
          values: [15],
        });
        expect(getNextFilterColumnNames().column).toBe("User → Latitude");
      });
    });

    describe("with two values", () => {
      it.each(BETWEEN_TEST_CASES)(
        "should add a filter with with %i to %i values",
        async (leftValue, rightValue) => {
          const { getNextFilterParts, getNextFilterColumnNames } = setup();
          const addFilterButton = screen.getByRole("button", {
            name: "Add filter",
          });

          await setOperator("Between");
          const leftInput = screen.getByPlaceholderText("Min");
          const rightInput = screen.getByPlaceholderText("Max");
          await userEvent.type(leftInput, String(leftValue));
          await userEvent.type(rightInput, String(rightValue));
          await userEvent.click(addFilterButton);

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: "between",
            values: [leftValue, rightValue],
            column: expect.anything(),
          });
          expect(getNextFilterColumnNames().column).toBe("User → Latitude");
        },
      );

      it("should swap values when min > max", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup();
        const addFilterButton = screen.getByRole("button", {
          name: "Add filter",
        });

        await setOperator("Between");
        const leftInput = screen.getByPlaceholderText("Min");
        const rightInput = screen.getByPlaceholderText("Max");
        await userEvent.type(leftInput, "5");
        await userEvent.type(rightInput, "-10.5");
        await userEvent.click(addFilterButton);

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [-10.5, 5],
        });
        expect(getNextFilterColumnNames().column).toBe("User → Latitude");
      });

      it("should add a filter via keyboard", async () => {
        const { onChange, getNextFilterParts, getNextFilterColumnNames } =
          setup();

        await setOperator("Between");
        const leftInput = screen.getByPlaceholderText("Min");
        const rightInput = screen.getByPlaceholderText("Max");
        await userEvent.type(leftInput, "5");
        await userEvent.type(rightInput, "-10.5{enter}");

        expect(onChange).toHaveBeenCalled();
        expect(getNextFilterParts()).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [-10.5, 5],
        });
        expect(getNextFilterColumnNames().column).toBe("User → Latitude");
      });
    });

    describe("with four values", () => {
      it("should add a filter", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup();
        const addFilterButton = screen.getByRole("button", {
          name: "Add filter",
        });

        await setOperator("Inside");
        await userEvent.type(screen.getByLabelText("Upper latitude"), "42");
        await userEvent.type(screen.getByLabelText("Lower latitude"), "-42");
        expect(addFilterButton).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Left longitude"), "-24");
        await userEvent.type(screen.getByLabelText("Right longitude"), "24");
        await userEvent.click(addFilterButton);

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "inside",
          values: [42, -24, -42, 24],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames()).toEqual({
          column: "User → Latitude",
          longitudeColumn: "User → Longitude",
        });
      });

      it("should swap latitude and longitude values when min > max", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup();
        const addFilterButton = screen.getByRole("button", {
          name: "Add filter",
        });

        await setOperator("Inside");
        await userEvent.type(screen.getByLabelText("Upper latitude"), "-40");
        await userEvent.type(screen.getByLabelText("Lower latitude"), "42");
        expect(addFilterButton).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Left longitude"), "24");
        await userEvent.type(screen.getByLabelText("Right longitude"), "-20");
        await userEvent.click(addFilterButton);

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "inside",
          values: [42, -20, -40, 24],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames()).toEqual({
          column: "User → Latitude",
          longitudeColumn: "User → Longitude",
        });
      });

      it("should add a filter via keyboard", async () => {
        const { onChange, getNextFilterParts, getNextFilterColumnNames } =
          setup();

        await setOperator("Inside");
        await userEvent.type(screen.getByLabelText("Upper latitude"), "-40");
        await userEvent.type(
          screen.getByLabelText("Lower latitude"),
          "42{enter}",
        );
        expect(onChange).not.toHaveBeenCalled();

        await userEvent.type(screen.getByLabelText("Left longitude"), "24");
        await userEvent.type(
          screen.getByLabelText("Right longitude"),
          "-20{enter}",
        );
        expect(getNextFilterParts()).toMatchObject({
          operator: "inside",
          values: [42, -20, -40, 24],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames()).toEqual({
          column: "User → Latitude",
          longitudeColumn: "User → Longitude",
        });
      });
    });

    describe("with many values", () => {
      it("should add a filter with many values", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup();

        await userEvent.click(screen.getByDisplayValue("Between"));
        await userEvent.click(screen.getByText("Is"));
        const input = screen.getByPlaceholderText("Enter a number");
        await userEvent.type(input, "5");
        await userEvent.tab();
        await userEvent.type(input, "10");
        await userEvent.click(screen.getByText("Add filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "=",
          values: [5, 10],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames().column).toBe("User → Latitude");
      });
    });

    it("should handle invalid input", async () => {
      setup();
      await userEvent.click(screen.getByDisplayValue("Between"));
      await userEvent.click(screen.getByText("Is"));
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
  });

  describe("existing filter", () => {
    describe("with one value", () => {
      it.each(NUMERIC_TEST_CASES)(
        "should render a filter with a %s value",
        (title, value) => {
          const opts = createQueryWithCoordinateFilter({
            operator: ">",
            values: [value],
          });
          setup(opts);

          expect(screen.getByText("User → Latitude")).toBeInTheDocument();
          expect(screen.getByDisplayValue("Greater than")).toBeInTheDocument();
          expect(screen.getByDisplayValue(String(value))).toBeInTheDocument();
          expect(screen.getByText("Update filter")).toBeEnabled();
        },
      );

      it.each(NUMERIC_TEST_CASES)(
        "should update a filter with a %s value",
        async (title, value) => {
          const opts = createQueryWithCoordinateFilter({
            operator: ">",
            values: [100],
          });
          const { getNextFilterParts, getNextFilterColumnNames } = setup(opts);

          await setOperator("Greater than");
          await userEvent.clear(screen.getByPlaceholderText("Enter a number"));
          await userEvent.type(
            screen.getByPlaceholderText("Enter a number"),
            `${value}`,
          );
          await userEvent.click(screen.getByText("Update filter"));

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: ">",
            values: [value],
            column: expect.anything(),
          });
          expect(getNextFilterColumnNames().column).toBe("User → Latitude");
        },
      );
    });

    describe("with two values", () => {
      it.each(BETWEEN_TEST_CASES)(
        "should render a filter with %i to %i values",
        (leftValue, rightValue) => {
          const opts = createQueryWithCoordinateFilter({
            operator: "between",
            values: [leftValue, rightValue],
          });
          setup(opts);

          expect(screen.getByText("User → Latitude")).toBeInTheDocument();
          expect(screen.getByDisplayValue("Between")).toBeInTheDocument();
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
          const opts = createQueryWithCoordinateFilter({
            operator: "between",
            values: [0, 100],
          });
          const { getNextFilterParts, getNextFilterColumnNames } = setup(opts);
          const updateButton = screen.getByRole("button", {
            name: "Update filter",
          });

          await setOperator("Between");
          const leftInput = screen.getByPlaceholderText("Min");
          const rightInput = screen.getByPlaceholderText("Max");
          await userEvent.clear(leftInput);
          await userEvent.type(leftInput, `${leftValue}`);
          expect(updateButton).toBeEnabled();

          await userEvent.clear(rightInput);
          await userEvent.type(rightInput, `${rightValue}`);
          await userEvent.click(updateButton);

          const filterParts = getNextFilterParts();
          expect(filterParts).toMatchObject({
            operator: "between",
            values: [leftValue, rightValue],
            column: expect.anything(),
          });
          expect(getNextFilterColumnNames().column).toBe("User → Latitude");
        },
      );
    });

    describe("with four values", () => {
      const query = createQuery();
      const opts = createQueryWithCoordinateFilter({
        query,
        operator: "inside",
        column: findLatitudeColumn(query),
        longitudeColumn: findLongitudeColumn(query),
        values: [42, -24, -42, 24],
      });

      it("should render a filter", () => {
        setup(opts);

        expect(screen.getByText("User → Latitude")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Inside")).toBeInTheDocument();

        expect(screen.getByLabelText("Upper latitude")).toHaveValue("42");
        expect(screen.getByLabelText("Lower latitude")).toHaveValue("-42");
        expect(screen.getByLabelText("Left longitude")).toHaveValue("-24");
        expect(screen.getByLabelText("Right longitude")).toHaveValue("24");

        expect(
          screen.getByRole("button", { name: "Update filter" }),
        ).toBeEnabled();
      });

      it("should update a filter", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup(opts);

        await setOperator("Inside");
        await userEvent.clear(screen.getByLabelText("Upper latitude"));
        await userEvent.type(screen.getByLabelText("Upper latitude"), "90");

        await userEvent.clear(screen.getByLabelText("Lower latitude"));
        await userEvent.type(screen.getByLabelText("Lower latitude"), "-90");

        await userEvent.clear(screen.getByLabelText("Left longitude"));
        await userEvent.type(screen.getByLabelText("Left longitude"), "-180");

        await userEvent.clear(screen.getByLabelText("Right longitude"));
        await userEvent.type(screen.getByLabelText("Right longitude"), "180");
        await userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "inside",
          values: [90, -180, -90, 180],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames()).toEqual({
          column: "User → Latitude",
          longitudeColumn: "User → Longitude",
        });
      });
    });

    describe("with many values", () => {
      it("should update a filter with many values", async () => {
        const { getNextFilterParts, getNextFilterColumnNames } = setup(
          createQueryWithCoordinateFilter({
            operator: "=",
            values: [-5, 0],
          }),
        );

        await userEvent.type(screen.getByLabelText("Filter value"), "5");
        await userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "=",
          values: [-5, 0, 5],
          column: expect.anything(),
        });
        expect(getNextFilterColumnNames().column).toBe("User → Latitude");
      });
    });

    it("should list operators", async () => {
      setup(createQueryWithCoordinateFilter({ operator: "<" }));

      await userEvent.click(screen.getByDisplayValue("Less than"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should change an operator", async () => {
      const opts = createQueryWithCoordinateFilter({
        operator: "<",
        values: [11],
      });
      const { getNextFilterParts, getNextFilterColumnNames } = setup(opts);

      await setOperator("Greater than");
      await userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: ">",
        values: [11],
        column: expect.anything(),
      });
      expect(getNextFilterColumnNames().column).toBe("User → Latitude");
    });

    it("should re-use values when changing an operator", async () => {
      setup(
        createQueryWithCoordinateFilter({ operator: "=", values: [-100, 200] }),
      );
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByText("-100")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();

      await setOperator("Is not");

      expect(screen.getByText("-100")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Between");

      expect(screen.getByDisplayValue("-100")).toBeInTheDocument();
      expect(screen.getByDisplayValue("200")).toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Greater than");

      expect(screen.getByDisplayValue("-100")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("200")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Inside");

      expect(screen.getByDisplayValue("-100")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("200")).not.toBeInTheDocument();
      expect(updateButton).toBeDisabled();
    });

    it("should go back", async () => {
      const { onBack, onChange } = setup(createQueryWithCoordinateFilter());
      await userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
