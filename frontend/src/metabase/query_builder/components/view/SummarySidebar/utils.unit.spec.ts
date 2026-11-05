import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryExpression,
} from "./types";
import {
  addExpressionDimension,
  addExpressionValue,
  buildSummaryQuery,
  canDropOnWell,
  dropOnWell,
  getDefaultFormulaName,
  getFormulaClause,
  getItemLabels,
  getSummaryBase,
  replaceWithExpression,
} from "./utils";

const EMPTY_DEFINITION: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

function createBase(): SummaryBase {
  return getSummaryBase(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  );
}

function compileFormula(
  { query, stageIndex }: SummaryBase,
  source: string,
  expressionMode: "aggregation" | "expression",
): Lib.ExpressionClause {
  const { expressionClause, error } = diagnoseAndCompile({
    source,
    expressionMode,
    query,
    stageIndex,
    database: SAMPLE_DATABASE,
    availableColumns:
      expressionMode === "aggregation"
        ? Lib.aggregableColumns(query, stageIndex)
        : Lib.expressionableColumns(query, stageIndex),
  });
  if (error || expressionClause == null) {
    throw new Error(`Could not compile ${source}: ${error?.message}`);
  }
  return expressionClause;
}

function createExpression(
  base: SummaryBase,
  name: string,
  source: string,
  expressionMode: "aggregation" | "expression",
): SummaryExpression {
  return { name, clause: compileFormula(base, source, expressionMode) };
}

function findColumn(base: SummaryBase, displayName: string) {
  const column = Lib.breakoutableColumns(base.query, base.stageIndex).find(
    (column) =>
      Lib.displayInfo(base.query, base.stageIndex, column).displayName ===
      displayName,
  );
  if (column == null) {
    throw new Error(`Could not find ${displayName}`);
  }
  return column;
}

function getColumnNames(query: Lib.Query, stageIndex: number) {
  return Lib.returnedColumns(query, stageIndex).map(
    (column) => Lib.displayInfo(query, stageIndex, column).displayName,
  );
}

describe("buildSummaryQuery", () => {
  it("groups by a custom column and aggregates with a custom expression", () => {
    const base = createBase();
    const definition = addExpressionValue(
      addExpressionDimension(
        EMPTY_DEFINITION,
        "rows",
        createExpression(base, "Large order", "[Total] > 100", "expression"),
      ),
      createExpression(
        base,
        "Average total",
        "Sum([Total]) / Count()",
        "aggregation",
      ),
    );

    const query = buildSummaryQuery(base, definition);

    expect(query).not.toBeNull();
    if (query == null) {
      return;
    }
    expect(getColumnNames(query, base.stageIndex)).toEqual([
      "Large order",
      "Average total",
    ]);
  });

  it("keeps custom columns with the same name apart", () => {
    const base = createBase();
    const definition = addExpressionDimension(
      addExpressionDimension(
        EMPTY_DEFINITION,
        "rows",
        createExpression(base, "Bucket", "[Total] > 100", "expression"),
      ),
      "columns",
      createExpression(base, "Bucket", "[Discount] > 0", "expression"),
    );

    const query = buildSummaryQuery(base, definition);

    expect(query && getColumnNames(query, base.stageIndex)).toEqual([
      "Bucket",
      "Bucket (2)",
    ]);
  });

  it("labels expression items with their names", () => {
    const base = createBase();
    const definition = addExpressionValue(
      addExpressionDimension(
        EMPTY_DEFINITION,
        "rows",
        createExpression(base, "Large order", "[Total] > 100", "expression"),
      ),
      createExpression(base, "Revenue", "Sum([Total])", "aggregation"),
    );

    const labels = getItemLabels(
      base,
      definition,
      buildSummaryQuery(base, definition),
    );

    expect([...labels.values()]).toEqual(["Large order", "Revenue"]);
  });
});

describe("dragging expression chips", () => {
  const base = createBase();
  const definition = addExpressionValue(
    addExpressionDimension(
      EMPTY_DEFINITION,
      "rows",
      createExpression(base, "Large order", "[Total] > 100", "expression"),
    ),
    createExpression(base, "Revenue", "Sum([Total])", "aggregation"),
  );
  const [dimension] = definition.rows;
  const [value] = definition.values;

  it("moves a custom column between Rows and Columns, keeping its formula", () => {
    const item = {
      kind: "chip",
      wellId: "rows",
      itemId: dimension.id,
      label: "Large order",
    } as const;

    expect(canDropOnWell(item, "columns", definition)).toBe(true);
    expect(dropOnWell(base, definition, item, "columns")).toEqual({
      ...definition,
      rows: [],
      columns: [dimension],
    });
  });

  it("doesn't turn a custom column into a value", () => {
    const item = {
      kind: "chip",
      wellId: "rows",
      itemId: dimension.id,
      label: "Large order",
    } as const;

    expect(canDropOnWell(item, "values", definition)).toBe(false);
    expect(dropOnWell(base, definition, item, "values")).toBe(definition);
  });

  it("doesn't turn a custom aggregation into a grouping", () => {
    const item = {
      kind: "chip",
      wellId: "values",
      itemId: value.id,
      label: "Revenue",
    } as const;

    expect(canDropOnWell(item, "rows", definition)).toBe(false);
  });

  it("still lets a column grouping become a value", () => {
    const withColumn = dropOnWell(
      base,
      definition,
      {
        kind: "column",
        column: findColumn(base, "Subtotal"),
        label: "Subtotal",
      },
      "columns",
    );
    const [columnDimension] = withColumn.columns;
    const item = {
      kind: "chip",
      wellId: "columns",
      itemId: columnDimension.id,
      label: "Subtotal",
    } as const;

    expect(canDropOnWell(item, "values", withColumn)).toBe(true);
  });
});

describe("editing as a formula", () => {
  it("edits a column value as the aggregation it stands for, in place", () => {
    const base = createBase();
    const definition = dropOnWell(
      base,
      EMPTY_DEFINITION,
      { kind: "column", column: findColumn(base, "Total"), label: "Total" },
      "values",
    );
    const [value] = definition.values;

    const clause = getFormulaClause(base, definition, value.id);
    expect(clause).not.toBeNull();

    const expression = createExpression(
      base,
      "Double revenue",
      "Sum([Total]) * 2",
      "aggregation",
    );
    const nextDefinition = replaceWithExpression(
      definition,
      value.id,
      expression,
    );

    expect(nextDefinition.values).toEqual([
      { id: value.id, type: "expression", expression },
    ]);
  });

  it("has no formula for column groupings", () => {
    const base = createBase();
    const definition = dropOnWell(
      base,
      EMPTY_DEFINITION,
      { kind: "column", column: findColumn(base, "Total"), label: "Total" },
      "rows",
    );

    expect(getFormulaClause(base, definition, definition.rows[0].id)).toBe(
      null,
    );
  });
});

describe("getDefaultFormulaName", () => {
  it("names a formula after itself, without column brackets", () => {
    expect(getDefaultFormulaName("Sum([Total]) /  Count")).toBe(
      "Sum(Total) / Count",
    );
  });

  it("shortens long formulas", () => {
    const name = getDefaultFormulaName(`[Total] + ${"1 + ".repeat(20)}1`);
    expect(name).toHaveLength(40);
    expect(name.endsWith("…")).toBe(true);
  });
});
