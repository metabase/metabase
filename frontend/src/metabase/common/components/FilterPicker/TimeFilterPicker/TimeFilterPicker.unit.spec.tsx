import dayjs from "dayjs";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";
import { createMockMetadata } from "__support__/metadata";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createOrdersTable,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersUserIdField,
  createOrdersDiscountField,
  createOrdersQuantityField,
  createOrdersCreatedAtField,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/types/constants";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { getDefaultValue } from "./utils";
import { TimeFilterPicker } from "./TimeFilterPicker";

const TIME_FIELD = createMockField({
  id: 100,
  name: "TIME",
  display_name: "Time",
  table_id: ORDERS_ID,
  base_type: TYPE.Time,
  effective_type: TYPE.Time,
  semantic_type: null,
});

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [
            createOrdersIdField(),
            createOrdersProductIdField(),
            createOrdersUserIdField(),
            createOrdersDiscountField(),
            createOrdersQuantityField(),
            createOrdersCreatedAtField(),
            TIME_FIELD,
          ],
        }),
      ],
    }),
  ],
});

function findTimeColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("ORDERS", "TIME");
}

function createFilteredQuery({
  operator = ">",
  values = [getDefaultValue()],
}: Partial<Lib.TimeFilterParts> = {}) {
  const initialQuery = createQuery({ metadata });
  const column = findTimeColumn(initialQuery);

  const clause = Lib.timeFilterClause({ operator, column, values });
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);

  return { query, column, filter };
}

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

const EXPECTED_OPERATORS = [
  "Before",
  "After",
  "Between",
  "Is empty",
  "Not empty",
];

function setup({
  query = createQuery({ metadata }),
  column = findTimeColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  render(
    <TimeFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  function getNextFilterParts() {
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const [filter] = lastCall;
    return Lib.timeFilterParts(query, 0, filter);
  }

  return { query, column, getNextFilterParts, onChange, onBack };
}

describe("TimeFilterPicker", () => {
  describe("new filter", () => {
    it("should render a blank editor", () => {
      setup();

      expect(screen.getByText(TIME_FIELD.display_name)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Before")).toBeInTheDocument();
      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument();
      expect(screen.getByText("Add filter")).toBeEnabled();
    });

    it("should list operators", async () => {
      setup();

      userEvent.click(screen.getByDisplayValue("Before"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should apply a default filter", () => {
      const { query, column, getNextFilterParts } = setup();

      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      const columnInfo = Lib.displayInfo(query, 0, column);
      expect(filterParts?.operator).toBe("<");
      expect(columnInfo.displayName).toBe("Time");
      expect(columnInfo.table?.displayName).toBe("Orders");
      expect(filterParts?.values).toEqual([getDefaultValue()]);
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterParts } = setup();

      userEvent.click(screen.getByDisplayValue("Before"));
      userEvent.click(await screen.findByText("After"));
      userEvent.type(screen.getByDisplayValue("00:00"), "11:15");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe(">");
      expect(filterParts?.values).toEqual([dayjs("11:15", "HH:mm").toDate()]);
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterParts } = setup();

      userEvent.click(screen.getByDisplayValue("Before"));
      userEvent.click(await screen.findByText("Between"));

      const [leftInput, rightInput] = screen.getAllByDisplayValue("00:00");
      userEvent.type(leftInput, "11:15");
      userEvent.type(rightInput, "12:30");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe("between");
      expect(filterParts?.values).toEqual([
        dayjs("11:15", "HH:mm").toDate(),
        dayjs("12:30", "HH:mm").toDate(),
      ]);
    });

    it("should add a filter with no values", async () => {
      const { getNextFilterParts } = setup();

      userEvent.click(screen.getByDisplayValue("Before"));
      userEvent.click(await screen.findByText("Is empty"));
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe("is-null");
      expect(filterParts?.values).toEqual([]);
    });

    it("should handle invalid input", () => {
      const { getNextFilterParts } = setup();

      userEvent.type(screen.getByDisplayValue("00:00"), "32:71");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.values).toEqual([dayjs("03:59", "HH:mm").toDate()]);
    });

    it("should go back", () => {
      const { onBack, onChange } = setup();
      userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    it("should render a filter with one value", () => {
      const opts = createFilteredQuery({
        operator: ">",
        values: [dayjs("11:15", "HH:mm").toDate()],
      });
      setup(opts);

      expect(screen.getByText(TIME_FIELD.display_name)).toBeInTheDocument();
      expect(screen.getByDisplayValue("After")).toBeInTheDocument();
      expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
      expect(screen.getByText("Update filter")).toBeEnabled();
    });

    it("should update a filter with one value", () => {
      const opts = createFilteredQuery({ operator: ">" });
      const { getNextFilterParts } = setup(opts);

      userEvent.type(screen.getByDisplayValue("00:00"), "20:45");
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe(">");
      expect(filterParts?.values).toEqual([dayjs("20:45", "HH:mm").toDate()]);
    });

    it("should render a filter with two values", () => {
      const opts = createFilteredQuery({
        operator: "between",
        values: [
          dayjs("11:15", "HH:mm").toDate(),
          dayjs("13:00", "HH:mm").toDate(),
        ],
      });
      setup(opts);

      expect(screen.getByText(TIME_FIELD.display_name)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Between")).toBeInTheDocument();
      expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
      expect(screen.getByDisplayValue("13:00")).toBeInTheDocument();
      expect(screen.getByText("Update filter")).toBeEnabled();
    });

    it("should update a filter with two values", () => {
      const opts = createFilteredQuery({
        operator: "between",
        values: [
          dayjs("11:15", "HH:mm").toDate(),
          dayjs("13:00", "HH:mm").toDate(),
        ],
      });
      const { getNextFilterParts } = setup(opts);

      userEvent.type(screen.getByDisplayValue("11:15"), "8:00");
      userEvent.click(screen.getByText("Update filter"));

      let filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe("between");
      expect(filterParts?.values).toEqual([
        dayjs("08:00", "HH:mm").toDate(),
        dayjs("13:00", "HH:mm").toDate(),
      ]);

      userEvent.type(screen.getByDisplayValue("13:00"), "17:31");
      userEvent.click(screen.getByText("Update filter"));

      filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe("between");
      expect(filterParts?.values).toEqual([
        dayjs("08:00", "HH:mm").toDate(),
        dayjs("17:31", "HH:mm").toDate(),
      ]);
    });

    it("should render a filter with no values", () => {
      const opts = createFilteredQuery({ operator: "not-null", values: [] });
      setup(opts);

      expect(screen.getByText(TIME_FIELD.display_name)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Not empty")).toBeInTheDocument();
      expect(screen.getByText("Update filter")).toBeEnabled();
    });

    it("should update a filter with no values", async () => {
      const opts = createFilteredQuery({ operator: "not-null", values: [] });
      const { getNextFilterParts } = setup(opts);

      userEvent.click(screen.getByDisplayValue("Not empty"));
      userEvent.click(await screen.findByText("Is empty"));
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe("is-null");
      expect(filterParts?.values).toEqual([]);
    });

    it("should list operators", async () => {
      const opts = createFilteredQuery({ operator: "<" });
      setup(opts);

      userEvent.click(screen.getByDisplayValue("Before"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should change an operator", async () => {
      const opts = createFilteredQuery({
        operator: "<",
        values: [dayjs("11:15", "HH:mm").toDate()],
      });
      const { getNextFilterParts } = setup(opts);

      userEvent.click(screen.getByDisplayValue("Before"));
      userEvent.click(await screen.findByText("After"));
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.operator).toBe(">");
      expect(filterParts?.values).toEqual([getDefaultValue()]);
    });

    it("should handle invalid filter value", () => {
      const opts = createFilteredQuery({
        values: [dayjs("32:66", "HH:mm").toDate()],
      });
      const { getNextFilterParts } = setup(opts);

      // There's no particular reason why 32:66 becomes 09:06
      // We trust the TimeInput to turn it into a valid time value
      const input = screen.getByDisplayValue("09:06");
      userEvent.type(input, "11:00");
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts?.values).toEqual([dayjs("11:00", "HH:mm").toDate()]);
    });

    it("should go back", () => {
      const opts = createFilteredQuery({ operator: "<" });
      const { onBack, onChange } = setup(opts);

      userEvent.click(screen.getByLabelText("Back"));

      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
