import type { JevFilterSuggestion } from "metabase/api/jev-filters";
import {
  type JevQuestionColumnsByKey,
  getJevQuestionColumns,
} from "metabase/querying/jev-filters/question-utils";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  type JevQuestionChoices,
  buildJevQuestionQuery,
  getJevQuestionCard,
} from "./question-query";

const STAGE_INDEX = -1;

function setup() {
  const table = Lib.tableOrCardMetadata(SAMPLE_PROVIDER, ORDERS_ID);
  if (!table) {
    throw new Error("No Orders table");
  }
  const query = Lib.queryFromTableOrCardMetadata(SAMPLE_PROVIDER, table);
  return { query, columnsByKey: getJevQuestionColumns(query) };
}

function findKey(columnsByKey: JevQuestionColumnsByKey, displayName: string) {
  const entry = Array.from(columnsByKey.values()).find(
    ({ info }) => info.display_name === displayName,
  );
  if (!entry) {
    throw new Error(`No column ${displayName}`);
  }
  return entry.info.key;
}

const NO_CHOICES: JevQuestionChoices = {
  filters: [],
  aggregation: { operator: "rows", column_key: null },
  breakout: { column_key: null },
  temporalUnit: "default",
  display: "auto",
};

function build(
  getChoices: (
    columnsByKey: JevQuestionColumnsByKey,
  ) => Partial<JevQuestionChoices>,
) {
  const { query, columnsByKey } = setup();
  const newQuery = buildJevQuestionQuery(query, columnsByKey, {
    ...NO_CHOICES,
    ...getChoices(columnsByKey),
  });
  const names = (clauses: Lib.Clause[]) =>
    clauses.map(
      (clause) => Lib.displayInfo(newQuery, STAGE_INDEX, clause).displayName,
    );
  return {
    query: newQuery,
    filters: names(Lib.filters(newQuery, STAGE_INDEX)),
    aggregations: names(Lib.aggregations(newQuery, STAGE_INDEX)),
    breakouts: names(Lib.breakouts(newQuery, STAGE_INDEX)),
  };
}

describe("buildJevQuestionQuery", () => {
  it("leaves the table query alone for raw rows and no grouping", () => {
    const { filters, aggregations, breakouts } = build(() => ({}));
    expect(filters).toEqual([]);
    expect(aggregations).toEqual([]);
    expect(breakouts).toEqual([]);
  });

  it("applies filters", () => {
    const { filters } = build((columnsByKey) => {
      const suggestion: JevFilterSuggestion = {
        parameter_id: findKey(columnsByKey, "User → State"),
        parameter_name: "User → State",
        parameter_type: "string/=",
        value: ["TX"],
        label: "TX",
        confidence: 0.93,
      };
      return {
        filters: [
          {
            suggestion,
            value: ["TX"],
            label: "TX",
            parameterType: "string/=",
          },
        ],
      };
    });
    expect(filters).toEqual(["State is TX"]);
  });

  it("counts rows", () => {
    const { aggregations } = build(() => ({
      aggregation: { operator: "count", column_key: null },
    }));
    expect(aggregations).toEqual(["Count"]);
  });

  it.each([
    ["sum", "Sum of Subtotal"],
    ["avg", "Average of Subtotal"],
    ["min", "Min of Subtotal"],
    ["max", "Max of Subtotal"],
  ] as const)("aggregates a column with %s", (operator, expected) => {
    const { aggregations } = build((columnsByKey) => ({
      aggregation: {
        operator,
        column_key: findKey(columnsByKey, "Subtotal"),
      },
    }));
    expect(aggregations).toEqual([expected]);
  });

  it("counts distinct values of an implicitly joined column", () => {
    const { aggregations } = build((columnsByKey) => ({
      aggregation: {
        operator: "distinct",
        column_key: findKey(columnsByKey, "Product → Category"),
      },
    }));
    expect(aggregations).toEqual(["Distinct values of Category"]);
  });

  it("skips an aggregation whose column is unknown", () => {
    const { aggregations } = build(() => ({
      aggregation: { operator: "sum", column_key: "missing" },
    }));
    expect(aggregations).toEqual([]);
  });

  it("groups by a category", () => {
    const { breakouts } = build((columnsByKey) => ({
      aggregation: { operator: "count", column_key: null },
      breakout: { column_key: findKey(columnsByKey, "Product → Category") },
    }));
    expect(breakouts).toEqual(["Category"]);
  });

  it("groups by a date with the chosen time unit", () => {
    const { breakouts } = build((columnsByKey) => ({
      aggregation: { operator: "count", column_key: null },
      breakout: { column_key: findKey(columnsByKey, "Created At") },
      temporalUnit: "quarter",
    }));
    expect(breakouts).toEqual(["Created At: Quarter"]);
  });

  it("groups by a date with its default unit", () => {
    const { breakouts } = build((columnsByKey) => ({
      aggregation: { operator: "count", column_key: null },
      breakout: { column_key: findKey(columnsByKey, "Created At") },
    }));
    expect(breakouts).toHaveLength(1);
    expect(breakouts[0]).toMatch(/^Created At/);
  });
});

describe("getJevQuestionCard", () => {
  it("locks an explicit chart type", () => {
    const { query } = setup();
    expect(getJevQuestionCard(query, "line")).toMatchObject({
      display: "line",
      displayIsLocked: true,
      dataset_query: Lib.toJsQuery(query),
    });
  });

  it("leaves the chart type to Metabase for auto", () => {
    const { query } = setup();
    expect(getJevQuestionCard(query, "auto")).toMatchObject({
      display: "table",
      displayIsLocked: false,
    });
  });
});
