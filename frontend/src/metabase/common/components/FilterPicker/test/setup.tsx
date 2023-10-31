import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";

import type { StructuredDatasetQuery } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createOrdersTable,
  createProductsTable,
  createPeopleTable,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { FilterPicker } from "../FilterPicker";

export const SEGMENT_1 = createMockSegment({
  id: 1,
  table_id: ORDERS_ID,
  name: "Discounted",
  description: "Orders with a discount",
  definition: {
    "source-table": ORDERS_ID,
    filter: ["not-null", ["field", ORDERS.DISCOUNT, null]],
  },
});

export const SEGMENT_2 = createMockSegment({
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
        createOrdersTable({ segments: [SEGMENT_1, SEGMENT_2] }),
        createProductsTable(),
        createPeopleTable(),
      ],
    }),
  ],
  segments: [SEGMENT_1, SEGMENT_2],
});

export function createQueryWithFilter(
  {
    tableName,
    columnName,
    operator,
    values,
  }: {
    tableName: string;
    columnName: string;
    operator: Lib.FilterOperatorName;
    values: any[];
  } = {
    tableName: "ORDERS",
    columnName: "TOTAL",
    operator: ">",
    values: [20],
  },
) {
  const initialQuery = createQuery({ metadata });
  const columns = Lib.filterableColumns(initialQuery, 0);
  const findColumn = columnFinder(initialQuery, columns);
  const totalColumn = findColumn(tableName, columnName);
  const clause = Lib.expressionClause(operator, [totalColumn, ...values], null);
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

export function createQueryWithSegmentFilter() {
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

export function setup({
  query = createQuery({ metadata }),
  filter,
}: SetupOpts = {}) {
  const dataset_query = Lib.toLegacyQuery(query) as StructuredDatasetQuery;
  const question = new Question(createAdHocCard({ dataset_query }), metadata);
  const legacyQuery = question.query() as StructuredQuery;

  const onSelect = jest.fn();
  const onSelectLegacy = jest.fn();

  renderWithProviders(
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
}
