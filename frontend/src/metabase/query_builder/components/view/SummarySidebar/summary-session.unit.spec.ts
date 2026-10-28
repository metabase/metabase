import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  type SummarySession,
  getStaleOutputFilters,
  getSummaryQuestion,
  getSummarySession,
  removeOutputFilter,
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
    const { session } = setup();

    expect(session.outputFilters).toHaveLength(2);
    expect(getOutputFilterNames(session)).toHaveLength(2);
    expect(getStaleOutputFilters(session)).toEqual([]);
  });

  it("leaves out a compound filter on a removed value and flags it", () => {
    const { session, countOnly } = setup();
    const nextSession = { ...session, definition: countOnly };

    expect(getOutputFilterNames(nextSession)).toEqual([
      "Count is greater than 10",
    ]);
    const staleFilters = getStaleOutputFilters(nextSession);
    expect(staleFilters).toHaveLength(1);
    expect(staleFilters[0].missingColumnNames).toEqual(["Sum of Total"]);
  });

  it("applies the flagged filter again when the value comes back", () => {
    const { session, countOnly, countAndSum } = setup();
    const withoutSum = { ...session, definition: countOnly };
    const withSumAgain = { ...withoutSum, definition: countAndSum };

    expect(getOutputFilterNames(withSumAgain)).toHaveLength(2);
    expect(getStaleOutputFilters(withSumAgain)).toEqual([]);
  });

  it("keeps a flagged filter when the summary is rebased on a changed question", () => {
    const { session, countOnly } = setup();
    const withoutSum = { ...session, definition: countOnly };
    const question = getSummaryQuestion(withoutSum);
    if (question == null) {
      throw new Error("Could not build the summary");
    }
    const query = question.query();
    const nextQuestion = question.setQuery(
      Lib.filter(query, 1, greaterThan(query, 1, "Count", 30)),
    );

    const rebasedSession = getSummarySession(nextQuestion, withoutSum);

    expect(getOutputFilterNames(rebasedSession)).toHaveLength(2);
    expect(getStaleOutputFilters(rebasedSession)).toHaveLength(1);
  });

  it("forgets a flagged filter once it is removed", () => {
    const { session, countOnly, countAndSum } = setup();
    const withoutSum = { ...session, definition: countOnly };
    const [{ filter }] = getStaleOutputFilters(withoutSum);
    const withSumAgain = {
      ...removeOutputFilter(withoutSum, filter),
      definition: countAndSum,
    };

    expect(getOutputFilterNames(withSumAgain)).toEqual([
      "Count is greater than 10",
    ]);
  });
});
