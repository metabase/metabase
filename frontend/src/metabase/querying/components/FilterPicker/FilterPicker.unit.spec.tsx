import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";

import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import * as Lib_ColumnTypes from "metabase-lib/column_types";
import {
  PRODUCT_CATEGORY_VALUES,
  PRODUCT_VENDOR_VALUES,
} from "metabase-types/api/mocks/presets";

import { FilterPicker } from "./FilterPicker";
import {
  createQuery,
  createFilteredQuery,
  createQueryWithBooleanFilter,
  createQueryWithCoordinateFilter,
  createQueryWithNumberFilter,
  createQueryWithStringFilter,
  createQueryWithTimeFilter,
  findBooleanColumn,
  findNumericColumn,
  findStringColumn,
  storeInitialState,
  createQueryWithSpecificDateFilter,
  findDateColumn,
  createQueryWithExcludeDateFilter,
  createQueryWithRelativeDateFilter,
  createQueryWithDefaultFilter,
} from "./test-utils";

const productCategories = PRODUCT_CATEGORY_VALUES.values.flat() as string[];
const productVendors = PRODUCT_VENDOR_VALUES.values.flat() as string[];

function createQueryWithMultipleValuesFilter() {
  const query = createQuery();
  const column = findStringColumn(query, "PRODUCTS", "VENDOR");

  const clause = Lib.stringFilterClause({
    operator: "!=",
    column,
    values: ["Vendor 1", "Vendor 2"],
    options: {},
  });

  return createFilteredQuery(query, clause);
}

function createQueryWithSegmentFilter() {
  const query = createQuery();
  const [segment] = Lib.availableSegments(query, 0);
  return createFilteredQuery(query, segment);
}

function createQueryWithNullStringFilter() {
  const query = createQuery();
  const column = findStringColumn(query);
  const clause = Lib.expressionClause("is-null", [column], null);

  return createFilteredQuery(query, clause);
}

function createQueryWithCustomNumberFilter() {
  const query = createQuery();
  const column1 = findBooleanColumn(query);
  const column2 = findNumericColumn(query);
  const clause = Lib.expressionClause(">", [column1, column2], null);

  return createFilteredQuery(query, clause);
}

type SetupOpts = {
  query?: Lib.Query;
  filter?: Lib.FilterClause;
};

type WidgetTestCase = [
  string,
  Partial<SetupOpts>,
  { section?: string; columnName: string; pickerId: string },
];

const WIDGET_TEST_CASES: WidgetTestCase[] = [
  [
    "boolean",
    createQueryWithBooleanFilter(),
    {
      section: "User",
      columnName: "Is Active",
      pickerId: "boolean-filter-picker",
    },
  ],
  [
    "coordinate",
    createQueryWithCoordinateFilter(),
    {
      section: "User",
      columnName: "Latitude",
      pickerId: "coordinate-filter-picker",
    },
  ],
  [
    "date",
    createQueryWithSpecificDateFilter({
      column: findDateColumn(createQuery()),
    }),
    {
      section: "User",
      columnName: "Birth Date",
      pickerId: "datetime-filter-picker",
    },
  ],
  [
    "datetime",
    createQueryWithSpecificDateFilter(),
    { columnName: "Created At", pickerId: "datetime-filter-picker" },
  ],
  [
    "number",
    createQueryWithNumberFilter(),
    { columnName: "Discount", pickerId: "number-filter-picker" },
  ],
  [
    "string",
    createQueryWithStringFilter(),
    {
      section: "Product",
      columnName: "Category",
      pickerId: "string-filter-picker",
    },
  ],
  [
    "time",
    createQueryWithTimeFilter(),
    { columnName: "Time", pickerId: "time-filter-picker" },
  ],
  [
    "default",
    createQueryWithDefaultFilter(),
    { columnName: "Unknown", pickerId: "default-filter-picker" },
  ],
];

function setup({ query = createQuery(), filter }: SetupOpts = {}) {
  const onSelect = jest.fn();

  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES, PRODUCT_VENDOR_VALUES]);

  renderWithProviders(
    <FilterPicker
      query={query}
      stageIndex={0}
      filter={filter}
      filterIndex={0}
      onSelect={onSelect}
    />,
    { storeInitialState },
  );

  function getNextFilter() {
    expect(onSelect).toHaveBeenCalledWith(expect.anything());
    const [filter] = onSelect.mock.lastCall;
    return filter;
  }

  function getNextFilterColumnName() {
    const filter = getNextFilter();
    const parts = Lib.filterParts(query, 0, filter);
    const column = checkNotNull(parts?.column);
    return Lib.displayInfo(query, 0, column).longDisplayName;
  }

  return {
    query,
    getNextFilter,
    getNextFilterColumnName,
    onSelect,
  };
}

describe("FilterPicker", () => {
  describe("without a filter", () => {
    it("should list filterable columns", async () => {
      setup();

      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Discount")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Product"));
      expect(screen.getByText("Category")).toBeInTheDocument();
    });

    it("should list segments", () => {
      setup();

      expect(screen.getByText("Discounted")).toBeInTheDocument();
      expect(screen.getByText("Many items")).toBeInTheDocument();
    });

    it("should not highlight anything", () => {
      setup();

      expect(screen.getByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Discount")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Discounted")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Many items")).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should add a segment filter", async () => {
      const { query, getNextFilter } = setup();

      await userEvent.click(screen.getByText("Discounted"));

      const filter = getNextFilter();
      const name = Lib.displayInfo(query, 0, filter).displayName;
      expect(name).toBe("Discounted");
    });

    describe("filter pickers", () => {
      it.each(WIDGET_TEST_CASES)(
        "should open correct picker for a %s column",
        async (type, query, { section, columnName, pickerId }) => {
          setup();

          if (section) {
            await userEvent.click(screen.getByText(section));
          }
          await userEvent.click(screen.getByText(columnName));

          expect(screen.getByTestId(pickerId)).toBeInTheDocument();
        },
      );

      it("should open a number picker for a numeric column", async () => {
        setup();
        await userEvent.click(screen.getByText("Total"));
        expect(screen.getByTestId("number-filter-picker")).toBeInTheDocument();
      });
    });
  });

  describe("with a filter", () => {
    it("should highlight the selected column", async () => {
      setup(createQueryWithNumberFilter());

      await userEvent.click(screen.getByLabelText("Back"));

      expect(await screen.findByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText("Discount")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Discounted")).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight the selected segment", async () => {
      setup(createQueryWithSegmentFilter());

      expect(await screen.findByLabelText("Discounted")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText("Many items")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should ignore the existing filter state when changing a column", async () => {
      const { query, getNextFilter, getNextFilterColumnName } = setup(
        createQueryWithMultipleValuesFilter(),
      );
      await waitForLoaderToBeRemoved(); // fetching Vendor field values

      await userEvent.click(screen.getByLabelText("Back"));
      await userEvent.click(screen.getByText("Category"));
      await waitForLoaderToBeRemoved(); // fetching Category field values

      productCategories.forEach(category => {
        expect(screen.getByLabelText(category)).not.toBeChecked();
      });
      productVendors.forEach(vendor => {
        expect(screen.queryByText(vendor)).not.toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Gadget"));
      await userEvent.click(screen.getByText("Gizmo"));
      await userEvent.click(screen.getByText("Update filter"));

      const filter = getNextFilter();
      const filterParts = Lib.stringFilterParts(query, 0, filter);
      expect(filterParts?.operator).toBe("=");
      expect(filterParts?.values).toEqual(["Gadget", "Gizmo"]);
      expect(getNextFilterColumnName()).toBe("Product → Category");
    });

    describe("filter pickers", () => {
      it.each(WIDGET_TEST_CASES)(
        "should open correct picker for a %s column",
        (type, opts, { pickerId }) => {
          setup(opts);
          expect(screen.getByTestId(pickerId)).toBeInTheDocument();
        },
      );

      it.each([
        ["specific", createQueryWithSpecificDateFilter()],
        ["relative", createQueryWithRelativeDateFilter()],
        ["exclude", createQueryWithExcludeDateFilter()],
      ])(`should open the date picker for a %s date filter`, (type, opts) => {
        setup(opts);
        expect(
          screen.getByTestId("datetime-filter-picker"),
        ).toBeInTheDocument();
      });

      it("should open the expression editor when column type isn't supported", () => {
        const spy = jest
          .spyOn(Lib_ColumnTypes, "isNumeric")
          .mockReturnValue(false);

        setup(createQueryWithNumberFilter());
        expect(screen.getByText(/Custom expression/i)).toBeInTheDocument();

        spy.mockRestore();
      });
    });

    it("should initialize widgets correctly after changing a column", async () => {
      const { query, getNextFilter, getNextFilterColumnName } = setup(
        createQueryWithNumberFilter(),
      );

      await userEvent.click(screen.getByLabelText("Back"));
      await userEvent.click(screen.getByText("Time"));

      expect(screen.getByLabelText("Filter operator")).toHaveValue("Before");
      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Update filter"));

      const filterParts = Lib.timeFilterParts(query, 0, getNextFilter());
      expect(filterParts?.operator).toBe("<");
      expect(filterParts?.values).toEqual([dayjs("00:00", "HH:mm").toDate()]);
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should change a filter segment", async () => {
      const { query, getNextFilter } = setup(createQueryWithSegmentFilter());

      await userEvent.click(screen.getByText("Many items"));

      const filter = getNextFilter();
      const name = Lib.displayInfo(query, 0, filter).displayName;
      expect(name).toBe("Many items");
    });

    it("should replace a segment filter with a column filter", async () => {
      const { query, getNextFilter, getNextFilterColumnName } = setup(
        createQueryWithSegmentFilter(),
      );

      await userEvent.click(screen.getByText("Total"));
      await userEvent.click(screen.getByDisplayValue("Between"));
      await userEvent.click(screen.getByText("Equal to"));
      const input = screen.getByPlaceholderText("Enter a number");
      await userEvent.type(input, "100");
      await userEvent.click(screen.getByText("Update filter"));

      const filter = getNextFilter();
      const filterParts = Lib.numberFilterParts(query, 0, filter);
      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: [100],
      });
      expect(getNextFilterColumnName()).toBe("Total");
    });
  });

  describe("custom expression", () => {
    async function editExpressionAndSubmit(
      text: string,
      { delay }: { delay: number } = { delay: 0 },
    ) {
      const input = screen.getByLabelText("Expression");
      const button = screen.getByRole("button", { name: "Done" });

      // The expression editor applies changes on blur,
      // but for some reason it doesn't work without `act`.

      await userEvent.clear(input);
      await userEvent.type(input, text, { delay });
      await userEvent.tab();

      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);
    }

    it("should create a filter with a custom expression", async () => {
      const { query, getNextFilter } = setup();

      await userEvent.click(screen.getByText(/Custom expression/i));
      await editExpressionAndSubmit("[[Total] > [[Discount]");

      const filter = getNextFilter();

      expect(Lib.displayInfo(query, 0, filter).displayName).toBe(
        "Total is greater than Discount",
      );
    });

    it("should open the expression editor for unsupported expressions", async () => {
      setup(createQueryWithNullStringFilter());
      expect(screen.getByLabelText("Expression")).toBeInTheDocument();
    });

    it("should update a filter with a numeric custom expression", async () => {
      const { query, getNextFilter } = setup(
        createQueryWithCustomNumberFilter(),
      );

      await editExpressionAndSubmit("{selectall}{backspace}[[Total] > 100", {
        delay: 50,
      });

      const filter = getNextFilter();

      expect(Lib.displayInfo(query, 0, filter).displayName).toBe(
        "Total is greater than 100",
      );
    });
  });
});
