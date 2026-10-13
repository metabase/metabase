import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  PivotTableColumnSplitSetting,
  VisualizationSettings,
} from "metabase-types/api";

import {
  compileFormula,
  getColumnFormula,
  getDefaultFormula,
  getReferenceFormula,
} from "./formula/table-formula";
import { getNextBlockLayout } from "./layout";
import type {
  SummaryBase,
  SummaryBlock,
  SummaryBlockLayout,
  SummaryDimension,
  SummaryDimensionWellId,
  SummaryDragItem,
  SummaryWellId,
} from "./types";
import { getColumnLabel, getItemKey } from "./utils";

export type BlockQueryResult =
  | { query: Lib.Query; error: null }
  | { query: null; error: string };

function createItemId() {
  return _.uniqueId("summary-item-");
}

function createBlockId() {
  return _.uniqueId("summary-block-");
}

/** The source query with the block's own filters applied. */
export function getBlockFilterQuery(
  base: SummaryBase,
  block: Pick<SummaryBlock, "filters">,
): Lib.Query {
  return block.filters.reduce(
    (query, filter) => Lib.filter(query, base.stageIndex, filter),
    base.query,
  );
}

/**
 * The source query without the data tab's filters, with only the block's own filters
 * applied. The block's filter picker edits against it, so a data tab filter can never
 * hide or merge with one of the block's.
 */
export function getBlockFilterEditQuery(
  base: SummaryBase,
  block: Pick<SummaryBlock, "filters">,
): Lib.Query {
  const { stageIndex } = base;
  const queryWithoutSourceFilters = Lib.filters(base.query, stageIndex).reduce(
    (query, filter) => Lib.removeClause(query, stageIndex, filter),
    base.query,
  );
  return block.filters.reduce(
    (query, filter) => Lib.filter(query, stageIndex, filter),
    queryWithoutSourceFilters,
  );
}

/** Turns what a filter picker returns into a filter clause for a block. */
export function toBlockFilter(
  base: SummaryBase,
  filter: Lib.Filterable,
): Lib.FilterClause | undefined {
  const { stageIndex } = base;
  const emptyQuery = getBlockFilterEditQuery(base, { filters: [] });
  return Lib.filters(Lib.filter(emptyQuery, stageIndex, filter), stageIndex)[0];
}

function findTemporalBucket(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  temporalUnit: string,
): Lib.Bucket | undefined {
  return Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === temporalUnit,
  );
}

function getBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
  dimension: SummaryDimension,
): Lib.ColumnMetadata | null {
  const column = Lib.findMatchingColumn(
    query,
    stageIndex,
    dimension.column,
    Lib.breakoutableColumns(query, stageIndex),
  );
  if (column == null) {
    return null;
  }
  const bucket =
    dimension.temporalUnit != null
      ? findTemporalBucket(query, stageIndex, column, dimension.temporalUnit)
      : undefined;
  return bucket
    ? Lib.withTemporalBucket(column, bucket)
    : Lib.withDefaultBucket(query, stageIndex, column);
}

/**
 * Builds the block's query on top of the latest source: its filters, then rows and columns as
 * breakouts, then each value's formula as an aggregation. Returns an error naming the first part
 * that no longer resolves, such as a column removed from the data tab.
 */
export function buildBlockQuery(
  base: SummaryBase,
  block: SummaryBlock,
): BlockQueryResult {
  const { stageIndex } = base;
  let query = getBlockFilterQuery(base, block);

  for (const dimension of [...block.rows, ...block.columns]) {
    const column = getBreakoutColumn(query, stageIndex, dimension);
    if (column == null) {
      const label = getColumnLabel(base, dimension.column);
      return {
        query: null,
        error: t`${label} is no longer available. Remove it to continue.`,
      };
    }
    query = Lib.breakout(query, stageIndex, column);
  }

  for (const value of block.values) {
    const compiled = compileFormula(query, value.source);
    if (compiled.error != null) {
      return { query: null, error: `${value.source}: ${compiled.error}` };
    }
    query = Lib.aggregate(query, stageIndex, compiled.clause);
  }

  return { query, error: null };
}

export function hasBlockContent(block: SummaryBlock): boolean {
  return (
    block.values.length > 0 || block.rows.length > 0 || block.columns.length > 0
  );
}

/** The block's visualization: the chosen one, or one that fits its shape. */
export function getBlockDisplay(block: SummaryBlock): CardDisplayType {
  if (block.display != null) {
    return block.display;
  }
  const dimensionCount = block.rows.length + block.columns.length;
  if (dimensionCount === 0) {
    return block.values.length === 1 ? "scalar" : "table";
  }
  return block.columns.length > 0 ? "pivot" : "table";
}

function getPivotColumnSplit(
  query: Lib.Query,
  stageIndex: number,
  block: SummaryBlock,
): PivotTableColumnSplitSetting {
  const columnInfos = Lib.returnedColumns(query, stageIndex).map((column) =>
    Lib.displayInfo(query, stageIndex, column),
  );
  const breakoutNames = columnInfos
    .filter((info) => info.isBreakout)
    .map((info) => info.name);
  const aggregationNames = columnInfos
    .filter((info) => info.isAggregation)
    .map((info) => info.name);
  const rowCount = block.rows.length;

  return {
    rows: breakoutNames.slice(0, rowCount),
    columns: breakoutNames.slice(rowCount),
    values: aggregationNames,
  };
}

function getBlockSettings(
  query: Lib.Query,
  stageIndex: number,
  block: SummaryBlock,
  display: CardDisplayType,
): VisualizationSettings {
  return display === "pivot"
    ? {
        "pivot_table.column_split": getPivotColumnSplit(
          query,
          stageIndex,
          block,
        ),
      }
    : {};
}

/** The title shown on the block: its own, or "Sum of Price by Category". */
export function getBlockTitle(
  base: SummaryBase,
  block: SummaryBlock,
  blockQuery: Lib.Query | null,
): string {
  if (block.title != null && block.title.trim().length > 0) {
    return block.title;
  }
  const { stageIndex } = base;
  const valueNames = blockQuery
    ? Lib.aggregations(blockQuery, stageIndex).map(
        (aggregation) =>
          Lib.displayInfo(blockQuery, stageIndex, aggregation).displayName,
      )
    : block.values.map((value) => value.source);
  const dimensionNames = blockQuery
    ? Lib.breakouts(blockQuery, stageIndex).map(
        (breakout) =>
          Lib.displayInfo(blockQuery, stageIndex, breakout).displayName,
      )
    : [...block.rows, ...block.columns].map((dimension) =>
        getColumnLabel(base, dimension.column),
      );

  const values =
    valueNames.length > 0 ? valueNames.join(", ") : t`Distinct values`;
  return dimensionNames.length > 0
    ? t`${values} by ${dimensionNames.join(", ")}`
    : values;
}

/** An unsaved question for the block, used to run it and to save it as a card. */
export function getBlockQuestion(
  dataQuestion: Question,
  base: SummaryBase,
  block: SummaryBlock,
  blockQuery: Lib.Query,
): Question {
  const display = getBlockDisplay(block);
  return Question.create({
    metadata: dataQuestion.metadata(),
    dataset_query: Lib.toJsQuery(blockQuery),
    display,
    visualization_settings: getBlockSettings(
      blockQuery,
      base.stageIndex,
      block,
      display,
    ),
  }).setDisplayName(getBlockTitle(base, block, blockQuery));
}

/** Labels for each row and column chip, including temporal units such as "Created At: Month". */
export function getDimensionLabels(
  base: SummaryBase,
  block: SummaryBlock,
  blockQuery: Lib.Query | null,
): Map<string, string> {
  const { stageIndex } = base;
  const breakoutLabels = blockQuery
    ? Lib.breakouts(blockQuery, stageIndex).map(
        (breakout) =>
          Lib.displayInfo(blockQuery, stageIndex, breakout).displayName,
      )
    : [];
  return new Map(
    [...block.rows, ...block.columns].map((dimension, index) => [
      dimension.id,
      breakoutLabels[index] ?? getColumnLabel(base, dimension.column),
    ]),
  );
}

export type TemporalUnitOption = {
  shortName: string;
  displayName: string;
  isDefault: boolean;
};

/** Temporal units a date dimension can be grouped by; empty for other columns. */
export function getTemporalUnitOptions(
  { query, stageIndex }: SummaryBase,
  column: Lib.ColumnMetadata,
): TemporalUnitOption[] {
  const matchingColumn = Lib.findMatchingColumn(
    query,
    stageIndex,
    column,
    Lib.breakoutableColumns(query, stageIndex),
  );
  if (matchingColumn == null) {
    return [];
  }
  return Lib.availableTemporalBuckets(query, stageIndex, matchingColumn).map(
    (bucket) => {
      const info = Lib.displayInfo(query, stageIndex, bucket);
      return {
        shortName: info.shortName,
        displayName: info.displayName,
        isDefault: info.default === true,
      };
    },
  );
}

export function createBlock(
  base: SummaryBase,
  blocks: readonly SummaryBlock[],
  overrides: Partial<Pick<SummaryBlock, "rows" | "values" | "title">> = {},
): SummaryBlock {
  const block: SummaryBlock = {
    id: createBlockId(),
    title: null,
    rows: [],
    columns: [],
    values: [{ id: createItemId(), source: getDefaultFormula(base.query) }],
    filters: [],
    display: null,
    layout: { x: 0, y: 0, w: 0, h: 0 },
    cardId: null,
    ...overrides,
  };
  return { ...block, layout: getNextBlockLayout(blocks, block) };
}

function createDimension(column: Lib.ColumnMetadata): SummaryDimension {
  return { id: createItemId(), column, temporalUnit: null };
}

/** A new block for a field dropped on the canvas: grouped by a column, or showing a metric. */
export function createBlockFromItem(
  base: SummaryBase,
  blocks: readonly SummaryBlock[],
  item: SummaryDragItem,
): SummaryBlock | null {
  switch (item.kind) {
    case "column":
      return createBlock(base, blocks, {
        rows: [createDimension(item.column)],
        values: [{ id: createItemId(), source: "Count()" }],
      });
    case "metric":
      return createBlock(base, blocks, {
        values: [
          {
            id: createItemId(),
            source: getReferenceFormula(base.query, item.metric),
          },
        ],
      });
    case "chip":
      return null;
  }
}

/** A copy that can be changed without affecting the original; it is not tied to a saved card. */
export function duplicateBlock(
  block: SummaryBlock,
  blocks: readonly SummaryBlock[],
): SummaryBlock {
  const copy: SummaryBlock = {
    ...block,
    id: createBlockId(),
    title: block.title != null ? t`${block.title} (copy)` : null,
    rows: block.rows.map((dimension) => ({
      ...dimension,
      id: createItemId(),
    })),
    columns: block.columns.map((dimension) => ({
      ...dimension,
      id: createItemId(),
    })),
    values: block.values.map((value) => ({ ...value, id: createItemId() })),
    cardId: null,
  };
  return { ...copy, layout: getNextBlockLayout(blocks, copy) };
}

export function canDropOnWell(
  item: SummaryDragItem,
  wellId: SummaryWellId,
): boolean {
  switch (item.kind) {
    case "column":
      return true;
    case "metric":
      return wellId === "values";
    case "chip":
      return item.wellId !== wellId;
  }
}

function withoutDimensionColumn(
  base: SummaryBase,
  block: SummaryBlock,
  column: Lib.ColumnMetadata,
): SummaryBlock {
  const columnKey = getItemKey(base, column);
  const isOtherColumn = (dimension: SummaryDimension) =>
    getItemKey(base, dimension.column) !== columnKey;
  return {
    ...block,
    rows: block.rows.filter(isOtherColumn),
    columns: block.columns.filter(isOtherColumn),
  };
}

function addDimension(
  base: SummaryBase,
  block: SummaryBlock,
  wellId: SummaryDimensionWellId,
  column: Lib.ColumnMetadata,
): SummaryBlock {
  // a column can only group the summary once, so dropping it moves it
  const nextBlock = withoutDimensionColumn(base, block, column);
  return {
    ...nextBlock,
    [wellId]: [...nextBlock[wellId], createDimension(column)],
  };
}

export function addValue(block: SummaryBlock, source: string): SummaryBlock {
  return {
    ...block,
    values: [...block.values, { id: createItemId(), source }],
  };
}

export function updateValue(
  block: SummaryBlock,
  valueId: string,
  source: string,
): SummaryBlock {
  return {
    ...block,
    values: block.values.map((value) =>
      value.id === valueId ? { ...value, source } : value,
    ),
  };
}

export function removeItem(block: SummaryBlock, itemId: string): SummaryBlock {
  return {
    ...block,
    rows: block.rows.filter(({ id }) => id !== itemId),
    columns: block.columns.filter(({ id }) => id !== itemId),
    values: block.values.filter(({ id }) => id !== itemId),
  };
}

export function setTemporalUnit(
  block: SummaryBlock,
  dimensionId: string,
  temporalUnit: string,
): SummaryBlock {
  const update = (dimension: SummaryDimension) =>
    dimension.id === dimensionId ? { ...dimension, temporalUnit } : dimension;
  return {
    ...block,
    rows: block.rows.map(update),
    columns: block.columns.map(update),
  };
}

function findDimension(
  block: SummaryBlock,
  itemId: string,
): SummaryDimension | undefined {
  return [...block.rows, ...block.columns].find(({ id }) => id === itemId);
}

/** Adds a field dropped on a block: a column groups its rows, a metric adds a value. */
export function dropOnBlock(
  base: SummaryBase,
  block: SummaryBlock,
  item: SummaryDragItem,
): SummaryBlock {
  switch (item.kind) {
    case "column":
      return addDimension(base, block, "rows", item.column);
    case "metric":
      return addValue(block, getReferenceFormula(base.query, item.metric));
    case "chip":
      return block;
  }
}

/** Applies a drag-and-drop of `item` onto a well; returns the block unchanged for unsupported drops. */
export function dropOnWell(
  base: SummaryBase,
  block: SummaryBlock,
  item: SummaryDragItem,
  wellId: SummaryWellId,
): SummaryBlock {
  if (!canDropOnWell(item, wellId)) {
    return block;
  }

  switch (item.kind) {
    case "column":
      return wellId === "values"
        ? addValue(block, getColumnFormula(base.query, item.column))
        : addDimension(base, block, wellId, item.column);
    case "metric":
      return addValue(block, getReferenceFormula(base.query, item.metric));
    case "chip": {
      const dimension = findDimension(block, item.itemId);
      if (dimension == null) {
        return block;
      }
      const remainingBlock = removeItem(block, item.itemId);
      if (wellId === "values") {
        return addValue(
          remainingBlock,
          getColumnFormula(base.query, dimension.column),
        );
      }
      return {
        ...remainingBlock,
        [wellId]: [...remainingBlock[wellId], dimension],
      };
    }
  }
}

export function updateBlockLayouts(
  blocks: readonly SummaryBlock[],
  layouts: ReadonlyMap<string, SummaryBlockLayout>,
): SummaryBlock[] {
  return blocks.map((block) => {
    const layout = layouts.get(block.id);
    return layout != null && !_.isEqual(layout, block.layout)
      ? { ...block, layout }
      : block;
  });
}
