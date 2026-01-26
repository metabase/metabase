/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CardId,
  DatabaseId,
  DatasetColumn,
  DatasetQuery,
  JoinStrategy,
  RowValue,
  TableId,
} from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const SAMPLE_DATABASE = createSampleDatabase();

const SAMPLE_METADATA = createMockMetadata({ databases: [SAMPLE_DATABASE] });

const SAMPLE_PROVIDER = createMetadataProvider({
  databaseId: SAMPLE_DATABASE.id,
  metadata: SAMPLE_METADATA,
});

export { SAMPLE_DATABASE, SAMPLE_METADATA, SAMPLE_PROVIDER };

type MetadataProviderOpts = {
  databaseId?: DatabaseId;
  metadata?: Metadata;
};

export function createMetadataProvider({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
}: MetadataProviderOpts = {}) {
  return Lib.metadataProvider(databaseId, metadata);
}

export const DEFAULT_QUERY: DatasetQuery = {
  database: SAMPLE_DATABASE.id,
  type: "query",
  query: {
    "source-table": ORDERS_ID,
  },
};

type QueryOpts = MetadataProviderOpts & {
  query?: DatasetQuery;
};

/**
 * @deprecated: Use createTestQuery, createTestJsQuery, createTestNativeQuery or createTestNativeJsQuery instead.
 */
export function createQuery({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
  query = DEFAULT_QUERY,
}: QueryOpts = {}) {
  const metadataProvider = createMetadataProvider({ databaseId, metadata });
  return Lib.fromJsQuery(metadataProvider, query);
}

export const columnFinder =
  (query: Lib.Query, columns: Lib.ColumnMetadata[]) =>
  (
    tableName: string | undefined | null,
    columnName: string,
  ): Lib.ColumnMetadata => {
    const column = columns.find((column) => {
      const displayInfo = Lib.displayInfo(query, 0, column);

      // for non-table columns - aggregations, custom columns
      if (!displayInfo.table || tableName == null) {
        return displayInfo.name === columnName;
      }

      return (
        displayInfo.table.name === tableName && displayInfo.name === columnName
      );
    });

    if (!column) {
      throw new Error(`Could not find ${tableName}.${columnName}`);
    }

    return column;
  };

export const findBinningStrategy = (
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }
  const buckets = Lib.availableBinningStrategies(query, 0, column);
  const bucket = buckets.find(
    (bucket) => Lib.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find binning strategy ${bucketName}`);
  }
  return bucket;
};

export const findTemporalBucket = (
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }

  const buckets = Lib.availableTemporalBuckets(query, 0, column);
  const bucket = buckets.find(
    (bucket) => Lib.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find temporal bucket ${bucketName}`);
  }
  return bucket;
};

export const findAggregationOperator = (
  query: Lib.Query,
  operatorShortName: string,
) => {
  const operators = Lib.availableAggregationOperators(query, 0);
  const operator = operators.find(
    (operator) =>
      Lib.displayInfo(query, 0, operator).shortName === operatorShortName,
  );
  if (!operator) {
    throw new Error(`Could not find aggregation operator ${operatorShortName}`);
  }
  return operator;
};

export const findSegment = (query: Lib.Query, segmentName: string) => {
  const stageIndex = 0;
  const segment = Lib.availableSegments(query, stageIndex).find(
    (segment) =>
      Lib.displayInfo(query, stageIndex, segment).displayName === segmentName,
  );
  if (!segment) {
    throw new Error(`Could not find segment ${segmentName}`);
  }
  return segment;
};

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

type AggregationClauseOpts =
  | {
      operatorName: string;
      tableName?: never;
      columnName?: never;
    }
  | {
      operatorName: string;
      tableName: string;
      columnName: string;
    };

interface BreakoutClauseOpts {
  columnName: string;
  tableName?: string;
  temporalBucketName?: string;
  binningStrategyName?: string;
}

export interface ExpressionClauseOpts {
  name: string;
  operator: Lib.ExpressionOperator;
  args: (Lib.ExpressionArg | Lib.ExpressionClause)[];
  options?: Lib.ExpressionOptions | null;
}

interface OrderByClauseOpts {
  columnName: string;
  tableName: string;
  direction: Lib.OrderByDirection;
}

interface QueryWithClausesOpts {
  query?: Lib.Query;
  expressions?: ExpressionClauseOpts[];
  aggregations?: AggregationClauseOpts[];
  breakouts?: BreakoutClauseOpts[];
  orderBys?: OrderByClauseOpts[];
}

/**
 * @deprecated: Use createTestQuery or createTestJsQuery instead.
 */
export function createQueryWithClauses({
  query = createQuery(),
  expressions = [],
  aggregations = [],
  breakouts = [],
  orderBys = [],
}: QueryWithClausesOpts) {
  const queryWithExpressions = expressions.reduce((query, expression) => {
    return Lib.expression(
      query,
      -1,
      expression.name,
      Lib.expressionClause(
        expression.operator,
        expression.args,
        expression.options,
      ),
    );
  }, query);

  const queryWithAggregations = aggregations.reduce((query, aggregation) => {
    return Lib.aggregate(
      query,
      -1,
      Lib.aggregationClause(
        findAggregationOperator(query, aggregation.operatorName),
        aggregation.columnName && aggregation.tableName
          ? columnFinder(query, Lib.visibleColumns(query, -1))(
              aggregation.tableName,
              aggregation.columnName,
            )
          : undefined,
      ),
    );
  }, queryWithExpressions);

  const queryWithBreakouts = breakouts.reduce((query, breakout) => {
    const breakoutColumn = columnFinder(
      query,
      Lib.breakoutableColumns(query, -1),
    )(breakout.tableName, breakout.columnName);
    return Lib.breakout(
      query,
      -1,
      withTemporalBucketAndBinningStrategy(
        query,
        breakoutColumn,
        breakout.temporalBucketName,
        breakout.binningStrategyName,
      ),
    );
  }, queryWithAggregations);

  return orderBys.reduce((query, orderBy) => {
    const orderByColumn = columnFinder(query, Lib.orderableColumns(query, -1))(
      orderBy.tableName,
      orderBy.columnName,
    );
    return Lib.orderBy(query, -1, orderByColumn, orderBy.direction);
  }, queryWithBreakouts);
}

export const queryDrillThru = (
  query: Lib.Query,
  stageIndex: number,
  clickObject: Lib.ClickObject,
  drillType: Lib.DrillThruType,
): Lib.DrillThru | null => {
  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    undefined,
    clickObject.column,
    clickObject.value,
    clickObject.data,
    clickObject.dimensions,
  );
  const drill = drills.find((drill) => {
    const drillInfo = Lib.displayInfo(query, stageIndex, drill);
    return drillInfo.type === drillType;
  });

  return drill ?? null;
};

export const findDrillThru = (
  query: Lib.Query,
  stageIndex: number,
  clickObject: Lib.ClickObject,
  drillType: Lib.DrillThruType,
) => {
  const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
  if (!drill) {
    throw new Error(`Could not find drill ${drillType}`);
  }

  const drillInfo = Lib.displayInfo(query, stageIndex, drill);
  return { drill, drillInfo };
};

interface ColumnClickObjectOpts {
  column: DatasetColumn;
}

export const getJoinQueryHelpers = (
  query: Lib.Query,
  stageIndex: number,
  tableId: TableId,
) => {
  const table = checkNotNull(Lib.tableOrCardMetadata(query, tableId));

  const findLHSColumn = columnFinder(
    query,
    Lib.joinConditionLHSColumns(query, stageIndex),
  );
  const findRHSColumn = columnFinder(
    query,
    Lib.joinConditionRHSColumns(query, stageIndex, table),
  );

  const defaultStrategy = Lib.availableJoinStrategies(query, stageIndex).find(
    (strategy) => Lib.displayInfo(query, stageIndex, strategy).default,
  );

  if (!defaultStrategy) {
    throw new Error("No default strategy found");
  }

  const defaultOperator = Lib.joinConditionOperators(query, stageIndex)[0];
  if (!defaultOperator) {
    throw new Error("No default operator found");
  }

  return {
    table,
    defaultStrategy,
    defaultOperator,
    findLHSColumn,
    findRHSColumn,
  };
};

export function createColumnClickObject({
  column,
}: ColumnClickObjectOpts): Lib.ClickObject {
  return { column };
}

interface RawCellClickObjectOpts {
  column: DatasetColumn;
  value: RowValue;
  data?: Lib.ClickObjectDataRow[];
}

export function createRawCellClickObject({
  column,
  value,
  data = [{ col: column, value }],
}: RawCellClickObjectOpts): Lib.ClickObject {
  return { column, value, data };
}

interface AggregatedCellClickObjectOpts {
  aggregation: Lib.ClickObjectDimension;
  breakouts: Lib.ClickObjectDimension[];
}

export function createAggregatedCellClickObject({
  aggregation,
  breakouts,
}: AggregatedCellClickObjectOpts): Lib.ClickObject {
  const data = [...breakouts, aggregation].map(({ column, value }) => ({
    key: column.name,
    col: column,
    value,
  }));

  return {
    column: aggregation.column,
    value: aggregation.value,
    data,
    dimensions: breakouts,
  };
}

interface PivotCellClickObjectOpts {
  aggregation: Lib.ClickObjectDimension;
  breakouts: Lib.ClickObjectDimension[];
}

export function createPivotCellClickObject({
  aggregation,
  breakouts,
}: PivotCellClickObjectOpts): Lib.ClickObject {
  const data = [...breakouts, aggregation].map(({ column, value }) => ({
    key: column.name,
    col: column,
    value,
  }));

  return { value: aggregation.value, data, dimensions: breakouts };
}

export function createLegendItemClickObject(
  dimension: Lib.ClickObjectDimension,
) {
  return { dimensions: [dimension] };
}

export type CreateTestQueryOpts = {
  databaseId: DatabaseId;
  stages: [TestQueryStageWithSource, ...TestQueryStage[]];
};

type TestQueryStage = {
  limit?: Lib.Limit;
  fields?: TestQueryColumnExpression[] | "all";
  joins?: TestQueryJoin[];
  filters?: TestQueryFilter[];
  aggregations?: TestQueryAggregation[];
  expressions?: TestQueryNamedExpression[];
  breakouts?: TestQueryBreakout[];
  orderBy?: TestQueryOrderBy[];
};

type TestQueryStageWithSource = TestQueryStage & {
  source: TestQuerySource;
};

type TestQueryTableSource = { type: "table"; id: TableId };
type TestQueryCardSource = { type: "card"; id: CardId };
type TestQuerySource = TestQueryTableSource | TestQueryCardSource;

type TestQueryJoin = {
  source: TestQuerySource;
  strategy: JoinStrategy;

  // If not set we will used the suggested join conditions
  conditions?: TestQueryJoinCondition[];
};

type TestQueryJoinCondition = {
  operator: Lib.JoinConditionOperator;
  left: TestQueryExpression;
  right: TestQueryExpression;
};

type TestQueryNamedExpression = {
  name: string;
  value: TestQueryExpression;
};

type TestQueryFilter = TestQueryExpression;

type TestQueryAggregation = TestQueryExpression | TestQueryNamedExpression;

type TestQueryExpression =
  | TestQueryLiteralExpression
  | TestQueryColumnExpression
  | TestQueryOperatorExpression;

type TestQueryLiteralExpression = {
  type: "literal";
  value: number | bigint | string | boolean;
};

type TestQueryColumnExpression = {
  type: "column";
  groupName?: string;
  name: string;
};

type TestQueryOperatorExpression = {
  type: "operator";
  operator: Lib.ExpressionOperator;
  args: TestQueryExpression[];
};

type TestQueryBreakout = {
  name: string;
  groupName?: string;
  unit?: string;
  binningCount?: number | "auto";
};

type TestQueryOrderBy = {
  name: string;
  groupName?: string;
  direction: Lib.OrderByDirection;
};

export function createTestQuery(
  metadataProvider: Lib.MetadataProvider,
  { stages }: CreateTestQueryOpts,
): Lib.Query {
  if (stages.length === 0) {
    throw new Error("query must have at least one stage");
  }

  if (!stages[0].source) {
    throw new Error("query must have a source in the first stage");
  }

  const firstSource = findSource(metadataProvider, stages[0].source);

  const initialQuery = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    firstSource,
  );

  return stages.reduce(
    (query: Lib.Query, stage, stageIndex) =>
      appendTestQueryStage(metadataProvider, stage, query, stageIndex),
    initialQuery,
  );
}

export function createTestJsQuery(
  metadataProvider: Lib.MetadataProvider,
  opts: CreateTestQueryOpts,
) {
  return Lib.toJsQuery(createTestQuery(metadataProvider, opts));
}

function appendTestQueryStage(
  metadataProvider: Lib.MetadataProvider,
  stage: TestQueryStage,
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const {
    limit,
    joins = [],
    expressions = [],
    filters = [],
    aggregations = [],
    breakouts = [],
    orderBy = [],
  } = stage;

  const queryWithStage = Lib.appendStage(query);

  const queryWithLimit =
    limit == null
      ? queryWithStage
      : Lib.limit(queryWithStage, stageIndex, limit);

  // Add joins to stage
  const queryWithJoins = joins.reduce((query, join) => {
    const joinClause = createTestJoinClause(
      metadataProvider,
      query,
      stageIndex,
      join,
    );
    return Lib.join(query, stageIndex, joinClause);
  }, queryWithLimit);

  // Add expressions
  const queryWithExpressions = expressions.reduce((query, expression) => {
    const expressionClause = expressionToExpressionClause(
      query,
      stageIndex,
      Lib.visibleColumns(query, stageIndex),
      expression.value,
    );
    return Lib.expression(query, stageIndex, expression.name, expressionClause);
  }, queryWithJoins);

  // Limit query fields
  const visibleColumns = Lib.visibleColumns(queryWithJoins, stageIndex);
  const queryWithFields =
    stage.fields == null || stage.fields === "all"
      ? // If no fields are specified, we use all the visible fields
        queryWithExpressions
      : // If fields are specified, we use only those fields
        Lib.withFields(
          queryWithExpressions,
          stageIndex,
          stage.fields.map((field) =>
            findColumn(queryWithJoins, stageIndex, visibleColumns, field),
          ),
        );

  // Add filters
  const queryWithFilters = filters.reduce((query, filter) => {
    const filterClause = createTestFilterClause(
      metadataProvider,
      query,
      stageIndex,
      filter,
    );
    return Lib.filter(query, stageIndex, filterClause);
  }, queryWithFields);

  // Add aggregations
  const queryWithAggregations = aggregations.reduce((query, aggregation) => {
    const aggregationClause = createTestAggregationClause(
      metadataProvider,
      query,
      stageIndex,
      aggregation,
    );
    return Lib.aggregate(query, stageIndex, aggregationClause);
  }, queryWithFilters);

  // Add breakouts
  const queryWithBreakouts = breakouts.reduce((query, breakout) => {
    const clause = createTestBreakoutClause(
      metadataProvider,
      query,
      stageIndex,
      breakout,
    );
    return Lib.breakout(query, stageIndex, clause);
  }, queryWithAggregations);

  const queryWithOrderBys = orderBy.reduce((query, orderBy) => {
    const columns = Lib.orderableColumns(query, stageIndex);
    const column = findColumn(query, stageIndex, columns, {
      type: "column",
      name: orderBy.name,
      groupName: orderBy.groupName,
    });
    return Lib.orderBy(query, stageIndex, column, orderBy.direction);
  }, queryWithBreakouts);

  return queryWithOrderBys;
}

function findSource(
  provider: Lib.MetadataProvider,
  source: TestQuerySource,
): Lib.TableMetadata | Lib.CardMetadata {
  const id = source.type === "card" ? `card__${source.id}` : source.id;
  const metadata = Lib.tableOrCardMetadata(provider, id);

  if (!metadata) {
    throw new Error(`Could not find source metadata for source: ${id}`);
  }

  return metadata;
}

function getGroupColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  column: TestQueryColumnExpression,
) {
  if (column.groupName) {
    const groups = Lib.groupColumns(columns);
    const group = groups.find((group) => {
      const info = Lib.displayInfo(query, stageIndex, group);
      return info.displayName === column.groupName;
    });
    if (!group) {
      const groupNames = groups.map(
        (group) => Lib.displayInfo(query, 0, group).displayName,
      );
      throw new Error(
        `Could not find group named ${column.groupName}, available names are: ${groupNames.join(", ")}`,
      );
    }
    return Lib.getColumnsFromColumnGroup(group);
  }
  return columns;
}

function findColumn(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  column: TestQueryColumnExpression,
) {
  const columnsFromGroup = getGroupColumns(query, stageIndex, columns, column);
  const candidates = columnsFromGroup.filter((candidate) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, candidate);
    return column.name === displayInfo.name;
  });

  if (candidates.length === 0) {
    throw new Error(`Could not find column named "${column.name}"`);
  } else if (candidates.length > 1 && column.groupName == null) {
    // If there is only one candidate that is not from an (implicit) join, return that one
    const filteredCandidates = candidates.filter((candidate) => {
      const displayInfo = Lib.displayInfo(query, stageIndex, candidate);
      return !displayInfo.isFromJoin && !displayInfo.isImplicitlyJoinable;
    });

    if (filteredCandidates.length === 1) {
      return filteredCandidates[0];
    }

    throw new Error(
      `More than one column named "${column.name}", please disambiguate using groupName`,
    );
  } else {
    // Just one candidate found, or they are all from the same table,
    // so they represent the same column. Return the first candidate.
    return candidates[0];
  }
}

function createTestJoinClause(
  metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  stageIndex: number,
  join: TestQueryJoin,
) {
  const targetMetadata = findSource(metadataProvider, join.source);

  // Pick join strategy
  const joinStrategy = findJoinStrategy(query, stageIndex, join.strategy);

  // Build join conditions
  const conditions =
    join.conditions == null
      ? // If no conditions are specified, use the suggested conditions
        Lib.suggestedJoinConditions(query, stageIndex, targetMetadata)
      : // If conditions are specified, use them
        join.conditions.map((condition) => {
          const lhs = expressionToJoinConditionExpression(
            query,
            stageIndex,
            Lib.joinConditionLHSColumns(query, stageIndex),
            condition.left,
          );

          const rhs = expressionToJoinConditionExpression(
            query,
            stageIndex,
            Lib.joinConditionRHSColumns(query, stageIndex, targetMetadata, lhs),
            condition.right,
          );

          return Lib.joinConditionClause(condition.operator, lhs, rhs);
        });

  return Lib.joinClause(targetMetadata, conditions, joinStrategy);
}

function findJoinStrategy(
  query: Lib.Query,
  stageIndex: number,
  strategyName: JoinStrategy,
) {
  const availableJoinStrategies = Lib.availableJoinStrategies(
    query,
    stageIndex,
  );
  const joinStrategy = availableJoinStrategies.find(
    (strategy) =>
      Lib.displayInfo(query, stageIndex, strategy).shortName === strategyName,
  );
  if (!joinStrategy) {
    throw new Error(`Could not find join strategy "${strategyName}"`);
  }
  return joinStrategy;
}

function expressionToExpressionParts(
  query: Lib.Query,
  stageIndex: number,
  availableColumns: Lib.ColumnMetadata[],
  expression: TestQueryExpression,
): Lib.ExpressionArg | Lib.ExpressionParts {
  switch (expression.type) {
    case "literal":
      return expression.value;
    case "column":
      return findColumn(query, stageIndex, availableColumns, expression);
    case "operator":
      return {
        operator: expression.operator,
        options: {},
        args: expression.args.map((arg) =>
          expressionToExpressionParts(query, stageIndex, availableColumns, arg),
        ),
      };
  }
}

function expressionToExpressionClause(
  query: Lib.Query,
  stageIndex: number,
  availableColumns: Lib.ColumnMetadata[],
  expression: TestQueryExpression,
): Lib.ExpressionClause {
  const expressionParts = expressionToExpressionParts(
    query,
    stageIndex,
    availableColumns,
    expression,
  );
  return Lib.expressionClause(expressionParts);
}

function expressionToJoinConditionExpression(
  query: Lib.Query,
  stageIndex: number,
  joinableColumns: Lib.ColumnMetadata[],
  expression: TestQueryExpression,
) {
  switch (expression.type) {
    case "column":
      return findColumn(query, stageIndex, joinableColumns, expression);
    case "operator":
    case "literal": {
      return expressionToExpressionClause(
        query,
        stageIndex,
        joinableColumns,
        expression,
      );
    }
  }
}

function createTestFilterClause(
  _metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  stageIndex: number,
  filter: TestQueryFilter,
): Lib.ExpressionClause {
  return expressionToExpressionClause(
    query,
    stageIndex,
    Lib.filterableColumns(query, stageIndex),
    filter,
  );
}

function createTestAggregationClause(
  metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  stageIndex: number,
  aggregation: TestQueryAggregation,
): Lib.ExpressionClause {
  if ("name" in aggregation && "value" in aggregation) {
    const clause = createTestAggregationClause(
      metadataProvider,
      query,
      stageIndex,
      aggregation.value,
    );
    return Lib.withExpressionName(clause, aggregation.name);
  }

  const clause = expressionToExpressionClause(
    query,
    stageIndex,
    Lib.aggregableColumns(query, stageIndex),
    aggregation,
  );
  return clause;
}

function createTestBreakoutClause(
  _metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  stageIndex: number,
  breakout: TestQueryBreakout,
): Lib.ColumnMetadata {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  const column = findColumn(query, stageIndex, columns, {
    type: "column",
    name: breakout.name,
    groupName: breakout.groupName,
  });

  if (breakout.unit) {
    const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
    const bucket = buckets.find((candidate) => {
      const info = Lib.displayInfo(query, stageIndex, candidate);
      return info.shortName === breakout.unit;
    });

    if (!bucket) {
      throw new Error(`Could not find temporal bucket ${breakout.unit}`);
    }

    return Lib.withTemporalBucket(column, bucket);
  }

  if (breakout.binningCount) {
    const strategies = Lib.availableBinningStrategies(
      query,
      stageIndex,
      column,
    );
    const strategy = strategies.find((candidate) => {
      const info = Lib.displayInfo(query, stageIndex, candidate);
      return (
        (breakout.binningCount === "auto" && info.displayName === "Auto bin") ||
        info.displayName === `${breakout.binningCount} bins`
      );
    });

    if (!strategy) {
      throw new Error(
        `Could not find binning strategy: ${breakout.binningCount}`,
      );
    }

    return Lib.withBinning(column, strategy);
  }

  return column;
}

export function createTestNativeQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
): Lib.Query {
  return Lib.nativeQuery(databaseId, metadataProvider, query);
}

export function createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
) {
  const nativeQuery = createTestNativeQuery(
    metadataProvider,
    databaseId,
    query,
  );
  return Lib.toJsQuery(nativeQuery);
}
