import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  type SummarySession,
  getSummaryQuestion,
  getSummarySession,
  setSummaryDefinition,
} from "./summary-session";
import type { SummaryDefinition } from "./types";
import { getSummaryBase } from "./utils";

const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

function findColumn(
  query: Lib.Query,
  stageIndex: number,
  displayName: string,
): Lib.ColumnMetadata {
  const column = Lib.filterableColumns(query, stageIndex).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).displayName === displayName,
  );
  if (column == null) {
    throw new Error(`Could not find ${displayName}`);
  }
  return column;
}

function greaterThan(
  query: Lib.Query,
  stageIndex: number,
  displayName: string,
  value: number,
) {
  return Lib.expressionClause(">", [
    findColumn(query, stageIndex, displayName),
    value,
  ]);
}

/**
 * A session for Count and Sum of Total by Category, whose question filters the output by
 * `Count > 10` and by `Count > 20 OR Sum of Total > 5`.
 */
function setup() {
  const sourceQuestion = new Question(createAdHocCard(), METADATA);
  const base = getSummaryBase(sourceQuestion.query());
  const breakoutColumn = Lib.breakoutableColumns(
    base.query,
    base.stageIndex,
  ).find(
    (column) =>
      Lib.displayInfo(base.query, base.stageIndex, column).longDisplayName ===
      "Product → Category",
  );
  const total = Lib.aggregableColumns(base.query, base.stageIndex).find(
    (column) =>
      Lib.displayInfo(base.query, base.stageIndex, column).displayName ===
      "Total",
  );
  if (breakoutColumn == null || total == null) {
    throw new Error("Could not find the summary columns");
  }
  const countOnly: SummaryDefinition = {
    rows: [{ id: "category", column: breakoutColumn }],
    columns: [],
    values: [{ id: "count", type: "count" }],
  };
  const countAndSum: SummaryDefinition = {
    ...countOnly,
    values: [
      ...countOnly.values,
      { id: "sum", type: "column", column: total, operatorShortName: "sum" },
    ],
  };
  const emptySession: SummarySession = {
    sourceQuestion,
    base,
    definition: countAndSum,
    outputFilters: [],
  };
  const summaryQuestion = getSummaryQuestion(emptySession);
  if (summaryQuestion == null) {
    throw new Error("Could not build the summary");
  }
  let query = Lib.appendStage(summaryQuestion.query());
  query = Lib.filter(query, 1, greaterThan(query, 1, "Count", 10));
  query = Lib.filter(
    query,
    1,
    Lib.expressionClause("or", [
      greaterThan(query, 1, "Count", 20),
      greaterThan(query, 1, "Sum of Total", 5),
    ]),
  );
  const session = getSummarySession(
    summaryQuestion.setQuery(query),
    emptySession,
  );
  return { session, countOnly, countAndSum };
}

function getOutputFilterNames(session: SummarySession): string[] {
  const query = getSummaryQuestion(session)?.query();
  if (query == null || Lib.stageCount(query) < 2) {
    return [];
  }
  return Lib.filters(query, 1).map(
    (filter) => Lib.displayInfo(query, 1, filter).longDisplayName,
  );
}

describe("summary output filters", () => {
  it("keeps every output filter while the summary outputs their columns", () => {
    const { session, countAndSum } = setup();

    expect(session.outputFilters).toHaveLength(2);
    expect(
      getOutputFilterNames(setSummaryDefinition(session, countAndSum)),
    ).toHaveLength(2);
  });

  it("drops a compound filter on a removed value", () => {
    const { session, countOnly } = setup();
    const nextSession = setSummaryDefinition(session, countOnly);

    expect(nextSession.outputFilters).toHaveLength(1);
    expect(getOutputFilterNames(nextSession)).toEqual([
      "Count is greater than 10",
    ]);
  });

  it("keeps a dropped filter gone when the value comes back", () => {
    const { session, countOnly, countAndSum } = setup();
    const withoutSum = setSummaryDefinition(session, countOnly);
    const withSumAgain = setSummaryDefinition(withoutSum, countAndSum);

    expect(getOutputFilterNames(withSumAgain)).toEqual([
      "Count is greater than 10",
    ]);
  });

  it("drops every output filter when the summary is cleared", () => {
    const { session, countAndSum } = setup();
    const cleared = setSummaryDefinition(session, {
      rows: [],
      columns: [],
      values: [],
    });

    expect(cleared.outputFilters).toEqual([]);
    expect(
      getOutputFilterNames(setSummaryDefinition(cleared, countAndSum)),
    ).toEqual([]);
  });
});
