import { createMockColumn, createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findBinningStrategy,
  findTemporalBucket,
} from "metabase-lib/test-helpers";

const FIELDS = {
  description: {
    id: 101,
    table_id: ORDERS_ID,
    name: "DESCRIPTION",
    display_name: "Description",
    base_type: "type/Text",
    semantic_type: "type/Description",
    effective_type: "type/Text",
  },
  comment: {
    id: 102,
    table_id: ORDERS_ID,
    name: "COMMENT",
    display_name: "Comment",
    base_type: "type/Text",
    semantic_type: "type/Comment",
    effective_type: "type/Text",
  },
  structured: {
    id: 103,
    table_id: ORDERS_ID,
    name: "STRUCTURED",
    display_name: "Structured",
    base_type: "type/Text",
    semantic_type: "type/Structured",
    effective_type: "type/Text",
  },
  serializedJSON: {
    id: 104,
    table_id: ORDERS_ID,
    name: "SERIALIZED_JSON",
    display_name: "SerializedJSON",
    base_type: "type/Text",
    semantic_type: "type/SerializedJSON",
    effective_type: "type/Text",
  },
};

export function createOrdersDescriptionField() {
  return createMockField(FIELDS.description);
}

export function createOrdersDescriptionColumn() {
  return createMockColumn(FIELDS.description);
}

export function createOrdersCommentField() {
  return createMockField(FIELDS.comment);
}

export function createOrdersCommentColumn() {
  return createMockColumn(FIELDS.comment);
}

export function createOrdersStructuredField() {
  return createMockField(FIELDS.structured);
}

export function createOrdersStructuredColumn() {
  return createMockColumn(FIELDS.structured);
}

export function createOrdersSerializedJSONField() {
  return createMockField(FIELDS.serializedJSON);
}

export function createOrdersSerializedJSONColumn() {
  return createMockColumn(FIELDS.serializedJSON);
}

export function createCountColumn() {
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    name: "count",
    display_name: "Count",
    source: "aggregation",
    aggregation_index: 0,
    field_ref: ["aggregation", 0],
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/Quantity",
  });
}

function withTemporalBucketAndBinningStrategy(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  temporalBucketName = "Don't bin",
  binningStrategyName = "Don't bin",
) {
  return Lib.withTemporalBucket(
    Lib.withBinning(
      column,
      findBinningStrategy(query, column, binningStrategyName),
    ),
    findTemporalBucket(query, column, temporalBucketName),
  );
}

interface AggregatedQueryOpts {
  aggregationOperatorName: string;
}

export function createAggregatedQuery({
  aggregationOperatorName,
}: AggregatedQueryOpts) {
  const query = createQuery();
  return Lib.aggregate(
    query,
    -1,
    Lib.aggregationClause(
      findAggregationOperator(query, aggregationOperatorName),
    ),
  );
}

interface AggregatedQueryWithBreakoutOpts {
  aggregationOperatorName: string;
  breakoutColumnName: string;
  breakoutColumnTableName: string;
  breakoutColumnTemporalBucketName?: string;
  breakoutColumnBinningStrategyName?: string;
}

export function createAggregatedQueryWithBreakout({
  aggregationOperatorName,
  breakoutColumnName,
  breakoutColumnTableName,
  breakoutColumnTemporalBucketName,
  breakoutColumnBinningStrategyName,
}: AggregatedQueryWithBreakoutOpts) {
  const query = createAggregatedQuery({ aggregationOperatorName });
  const breakoutColumn = columnFinder(
    query,
    Lib.breakoutableColumns(query, -1),
  )(breakoutColumnTableName, breakoutColumnName);

  return Lib.breakout(
    query,
    -1,
    withTemporalBucketAndBinningStrategy(
      query,
      breakoutColumn,
      breakoutColumnTemporalBucketName,
      breakoutColumnBinningStrategyName,
    ),
  );
}

interface AggregatedQueryWithBreakoutsOpts {
  aggregationOperatorName: string;
  breakoutColumn1Name: string;
  breakoutColumn1TableName: string;
  breakoutColumn1TemporalBucketName?: string;
  breakoutColumn1BinningStrategyName?: string;
  breakoutColumn2Name: string;
  breakoutColumn2TableName: string;
}

export function createAggregatedQueryWithBreakouts({
  aggregationOperatorName,
  breakoutColumn1Name,
  breakoutColumn1TableName,
  breakoutColumn1TemporalBucketName,
  breakoutColumn1BinningStrategyName,
  breakoutColumn2Name,
  breakoutColumn2TableName,
}: AggregatedQueryWithBreakoutsOpts) {
  const queryWithBreakout = createAggregatedQueryWithBreakout({
    aggregationOperatorName,
    breakoutColumnName: breakoutColumn1Name,
    breakoutColumnTableName: breakoutColumn1TableName,
    breakoutColumnTemporalBucketName: breakoutColumn1TemporalBucketName,
    breakoutColumnBinningStrategyName: breakoutColumn1BinningStrategyName,
  });
  return Lib.breakout(
    queryWithBreakout,
    -1,
    columnFinder(
      queryWithBreakout,
      Lib.breakoutableColumns(queryWithBreakout, -1),
    )(breakoutColumn2TableName, breakoutColumn2Name),
  );
}

interface OrderedQueryOpts {
  columnName: string;
  columnTableName: string;
  direction: Lib.OrderByDirection;
}

export function createSortedQuery({
  columnName,
  columnTableName,
  direction,
}: OrderedQueryOpts) {
  const query = createQuery();
  const column = columnFinder(query, Lib.orderableColumns(query, -1))(
    columnTableName,
    columnName,
  );
  return Lib.orderBy(query, -1, column, direction);
}

export function createNotEditableQuery(query: Lib.Query) {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [],
      }),
    ],
  });

  return createQuery({
    metadata,
    query: Lib.toLegacyQuery(query),
  });
}
