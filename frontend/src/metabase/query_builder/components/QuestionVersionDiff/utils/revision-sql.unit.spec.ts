import type { Revision } from "metabase-types/api";
import { createMockRevision } from "metabase-types/api/mocks";

import {
  getDefaultComparison,
  getQueryFromDatasetQuery,
  getQuestionVersions,
} from "./revision-sql";

const SQL_1 = "SELECT *\nFROM PRODUCTS\nWHERE CATEGORY = 'Widget';";
const SQL_2 =
  "SELECT\n  ID,\n  TITLE,\n  PRICE\nFROM PRODUCTS\nWHERE CATEGORY = 'Widget';";
const SQL_3 =
  "SELECT\n  ID,\n  TITLE,\n  PRICE\nFROM PRODUCTS\nWHERE CATEGORY IN ('Widget', 'Gadget')\nORDER BY PRICE DESC;";

const nativeQuery = (sql: string) => ({
  "lib/type": "mbql/query",
  database: 1,
  stages: [{ "lib/type": "mbql.stage/native", native: sql }],
});

// Mirrors the shape `clojure.data/diff` produces for a changed SQL string
const sqlDiff = (before: string, after: string): Revision["diff"] => ({
  before: { dataset_query: { stages: [{ native: before }] } },
  after: { dataset_query: { stages: [{ native: after }] } },
});

const nameDiff = (before: string, after: string): Revision["diff"] => ({
  before: { name: before },
  after: { name: after },
});

const getSqls = (revisions: Revision[], currentDatasetQuery?: unknown) =>
  getQuestionVersions(revisions, currentDatasetQuery).map(
    ({ versionNumber, query }) => ({
      versionNumber,
      sql: query.type === "native" ? query.sql : query.type,
    }),
  );

describe("getQueryFromDatasetQuery", () => {
  it("reads SQL from a full MBQL 5 native query", () => {
    expect(getQueryFromDatasetQuery(nativeQuery(SQL_1))).toEqual({
      type: "native",
      sql: SQL_1,
    });
  });

  it("reads SQL from a partial MBQL 5 diff fragment", () => {
    expect(getQueryFromDatasetQuery({ stages: [{ native: SQL_2 }] })).toEqual({
      type: "native",
      sql: SQL_2,
    });
  });

  it("reads SQL from a legacy native query", () => {
    expect(
      getQueryFromDatasetQuery({
        type: "native",
        native: { query: SQL_1 },
        database: 1,
      }),
    ).toEqual({ type: "native", sql: SQL_1 });
  });

  it("recognizes MBQL 5 and legacy GUI queries", () => {
    expect(
      getQueryFromDatasetQuery({
        stages: [{ "lib/type": "mbql.stage/mbql", "source-table": 1 }],
      }),
    ).toEqual({ type: "not-native" });
    expect(
      getQueryFromDatasetQuery({ type: "query", query: { "source-table": 1 } }),
    ).toEqual({ type: "not-native" });
  });

  it("returns undefined when the fragment does not describe the SQL", () => {
    expect(getQueryFromDatasetQuery(undefined)).toBeUndefined();
    expect(getQueryFromDatasetQuery({ database: 2 })).toBeUndefined();
    expect(getQueryFromDatasetQuery({ stages: [null] })).toBeUndefined();
    expect(
      getQueryFromDatasetQuery({
        stages: [{ "template-tags": { x: { name: "x" } } }],
      }),
    ).toBeUndefined();
  });
});

describe("getQuestionVersions", () => {
  it("rebuilds the SQL of every revision from the diffs, newest first", () => {
    const revisions = [
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({ id: 2, diff: sqlDiff(SQL_1, SQL_2) }),
      createMockRevision({ id: 3, diff: sqlDiff(SQL_2, SQL_3) }),
    ];

    expect(getSqls(revisions)).toEqual([
      { versionNumber: 3, sql: SQL_3 },
      { versionNumber: 2, sql: SQL_2 },
      { versionNumber: 1, sql: SQL_1 },
    ]);
  });

  it("does not depend on the order of the input", () => {
    const revisions = [
      createMockRevision({ id: 3, diff: sqlDiff(SQL_2, SQL_3) }),
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({ id: 2, diff: sqlDiff(SQL_1, SQL_2) }),
    ];

    expect(getSqls(revisions).map(({ sql }) => sql)).toEqual([
      SQL_3,
      SQL_2,
      SQL_1,
    ]);
  });

  it("carries the SQL through revisions that did not change the query", () => {
    const revisions = [
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({ id: 2, diff: nameDiff("A", "B") }),
      createMockRevision({ id: 3, diff: sqlDiff(SQL_1, SQL_2) }),
      createMockRevision({ id: 4, diff: nameDiff("B", "C") }),
    ];

    expect(getSqls(revisions, nativeQuery("ignored"))).toEqual([
      { versionNumber: 4, sql: SQL_2 },
      { versionNumber: 3, sql: SQL_2 },
      { versionNumber: 2, sql: SQL_1 },
      { versionNumber: 1, sql: SQL_1 },
    ]);
  });

  it("falls back to the current card query when no revision changed the SQL", () => {
    const revisions = [
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({ id: 2, diff: nameDiff("A", "B") }),
    ];

    expect(getSqls(revisions, nativeQuery(SQL_1))).toEqual([
      { versionNumber: 2, sql: SQL_1 },
      { versionNumber: 1, sql: SQL_1 },
    ]);
  });

  it("marks versions as unknown when nothing describes the SQL", () => {
    const revisions = [createMockRevision({ id: 1, diff: null })];

    expect(getSqls(revisions)).toEqual([{ versionNumber: 1, sql: "unknown" }]);
  });

  it("handles conversions between GUI and native queries", () => {
    const revisions = [
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({
        id: 2,
        diff: {
          before: {
            dataset_query: {
              stages: [{ "lib/type": "mbql.stage/mbql", "source-table": 1 }],
            },
          },
          after: {
            dataset_query: {
              stages: [{ "lib/type": "mbql.stage/native", native: SQL_1 }],
            },
          },
        },
      }),
    ];

    expect(getSqls(revisions)).toEqual([
      { versionNumber: 2, sql: SQL_1 },
      { versionNumber: 1, sql: "not-native" },
    ]);
  });
});

describe("getDefaultComparison", () => {
  it("compares the newest version with the closest one that has different SQL", () => {
    const versions = getQuestionVersions([
      createMockRevision({ id: 1, is_creation: true, diff: null }),
      createMockRevision({ id: 2, diff: sqlDiff(SQL_1, SQL_2) }),
      createMockRevision({ id: 3, diff: nameDiff("A", "B") }),
    ]);

    const comparison = getDefaultComparison(versions);
    expect(comparison?.newVersion.versionNumber).toBe(3);
    expect(comparison?.oldVersion.versionNumber).toBe(1);
  });

  it("falls back to the previous version when all SQL is identical", () => {
    const versions = getQuestionVersions(
      [
        createMockRevision({ id: 1, is_creation: true, diff: null }),
        createMockRevision({ id: 2, diff: nameDiff("A", "B") }),
      ],
      nativeQuery(SQL_1),
    );

    const comparison = getDefaultComparison(versions);
    expect(comparison?.newVersion.versionNumber).toBe(2);
    expect(comparison?.oldVersion.versionNumber).toBe(1);
  });

  it("returns null when there is nothing to compare", () => {
    expect(getDefaultComparison([])).toBeNull();
    expect(
      getDefaultComparison(
        getQuestionVersions([createMockRevision({ id: 1 })]),
      ),
    ).toBeNull();
  });
});
