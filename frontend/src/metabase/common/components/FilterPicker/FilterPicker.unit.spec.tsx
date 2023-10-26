import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { createMockMetadata } from "__support__/metadata";
import { render, screen } from "__support__/ui";

import type { StructuredDatasetQuery } from "metabase-types/api";
import { createMockField, createMockSegment } from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createOrdersTable,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersUserIdField,
  createOrdersTotalField,
  createOrdersDiscountField,
  createOrdersQuantityField,
  createOrdersCreatedAtField,
  createProductsTable,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/types/constants";
import * as Lib_ColumnTypes from "metabase-lib/column_types";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { FilterPicker } from "./FilterPicker";

const TIME_FIELD = createMockField({
  id: 100,
  name: "TIME",
  display_name: "Time",
  table_id: ORDERS_ID,
  base_type: TYPE.Time,
  effective_type: TYPE.Time,
  semantic_type: null,
});

const SEGMENT_1 = createMockSegment({
  id: 1,
  table_id: ORDERS_ID,
  name: "Discounted",
  description: "Orders with a discount",
  definition: {
    "source-table": ORDERS_ID,
    filter: ["not-null", ["field", ORDERS.DISCOUNT, null]],
  },
});

const SEGMENT_2 = createMockSegment({
  id: 2,
  table_id: ORDERS_ID,
  name: "Many items",
  description: "Orders with more than 5 items",
  definition: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.QUANTITY, null], 20],
  },
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
            createOrdersTotalField(),
            createOrdersDiscountField(),
            createOrdersQuantityField(),
            createOrdersCreatedAtField(),
            TIME_FIELD,
          ],
          segments: [SEGMENT_1, SEGMENT_2],
        }),
        createProductsTable(),
      ],
    }),
  ],
  segments: [SEGMENT_1, SEGMENT_2],
});

function createQueryWithFilter() {
  const initialQuery = createQuery({ metadata });
  const columns = Lib.filterableColumns(initialQuery, 0);
  const findColumn = columnFinder(initialQuery, columns);
  const totalColumn = findColumn("ORDERS", "TOTAL");
  const clause = Lib.expressionClause(">", [totalColumn, 20], null);
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

function createQueryWithSegmentFilter() {
  const initialQuery = createQuery({ metadata });
  const [segment] = Lib.availableSegments(initialQuery, 0);
  const query = Lib.filter(initialQuery, 0, segment);
  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

type SetupOpts = {
  query?: Lib.Query;
  filter?: Lib.FilterClause;
};

function setup({ query = createQuery({ metadata }), filter }: SetupOpts = {}) {
  const dataset_query = Lib.toLegacyQuery(query) as StructuredDatasetQuery;
  const question = new Question(createAdHocCard({ dataset_query }), metadata);
  const legacyQuery = question.query() as StructuredQuery;

  const onSelect = jest.fn();
  const onSelectLegacy = jest.fn();

  render(
    <FilterPicker
      query={query}
      stageIndex={0}
      filter={filter}
      filterIndex={0}
      legacyQuery={legacyQuery}
      onSelect={onSelect}
      onSelectLegacy={onSelectLegacy}
    />,
  );

  function getNextFilter() {
    const lastCall = onSelect.mock.calls[onSelect.mock.calls.length - 1];
    const [filter] = lastCall;
    return filter;
  }

  return { query, getNextFilter };
}

describe("FilterPicker", () => {
  describe("without a filter", () => {
    it("should list filterable columns", () => {
      setup();

      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Discount")).toBeInTheDocument();

      userEvent.click(screen.getByText("Product"));
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
  });

  describe("with a filter", () => {
    it("should show the filter editor", () => {
      setup(createQueryWithFilter());
      expect(screen.getByText("Update filter")).toBeInTheDocument();
    });

    it("should highlight the selected column", async () => {
      setup(createQueryWithFilter());

      userEvent.click(screen.getByLabelText("Back"));

      expect(await screen.findByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText("Discount")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText(SEGMENT_1.name)).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight the selected segment", async () => {
      setup(createQueryWithSegmentFilter());

      expect(await screen.findByLabelText(SEGMENT_1.name)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText(SEGMENT_2.name)).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should open the expression editor when column type isn't supported", () => {
      const spy = jest
        .spyOn(Lib_ColumnTypes, "isNumeric")
        .mockReturnValue(false);

      setup(createQueryWithFilter());
      expect(screen.getByText(/Custom expression/i)).toBeInTheDocument();

      spy.mockRestore();
    });
  });

  describe("time filter picker", () => {
    it("should initialize correctly after changing a column", () => {
      const { query, getNextFilter } = setup(createQueryWithFilter());

      userEvent.click(screen.getByLabelText("Back"));
      userEvent.click(screen.getByText(TIME_FIELD.display_name));

      expect(screen.getByLabelText("Filter operator")).toHaveValue("Before");
      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument();

      userEvent.click(screen.getByText("Update filter"));

      const filterParts = Lib.timeFilterParts(query, 0, getNextFilter());
      const column = filterParts?.column as Lib.ColumnMetadata;
      expect(filterParts?.operator).toBe("<");
      expect(filterParts?.values).toEqual([dayjs("00:00", "HH:mm").toDate()]);
      expect(Lib.displayInfo(query, 0, column).longDisplayName).toBe(
        TIME_FIELD.display_name,
      );
    });
  });
});
