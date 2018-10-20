import type { SummaryTableSettings } from "metabase/meta/types/summary_table";
import { Set } from "immutable";
import zip from "lodash.zip";
import set from "lodash.set";
import type { ColumnName } from "metabase/meta/types/Dataset";
import { getQueryPlan } from "metabase/visualizations/lib/summary_table";

const createQueryPlan = (
  settings: SummaryTableSettings,
  isAggregation: ColumnName => Boolean,
) => getQueryPlan(settings, isAggregation || (() => true));

const setsExpectToBeEqual = (computed: Set, expected: Set) =>
  expect(computed.equals(expected)).toEqual(true);

const groupingsExpectToEqual = (
  groupings: Set<string>[][],
  expectedGroupings: Set<string>[][],
) => {
  expect(groupings.length).toEqual(expectedGroupings.length);

  zip(groupings, expectedGroupings).forEach(([gr, exGr]) =>
    setsExpectToBeEqual(Set.of(...gr), Set.of(...exGr)),
  );
};

const toValidSettings = baseSettings => {
  const {
    groupsSources,
    columnsSource,
    valuesSources,
    columnNameToMetadata,
  } = baseSettings;
  const updatedColumnNameToMetadata = [
    ...groupsSources,
    ...columnsSource,
    ...valuesSources,
  ].reduce(
    (acc, columnName) => set(acc, [columnName, "isAscSortOrder"], true),
    { ...columnNameToMetadata },
  );
  return { ...baseSettings, columnNameToMetadata: updatedColumnNameToMetadata };
};

describe("summary table query plan", () => {
  describe("given query plan initialized by grouped columns: a,b,c", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: [],
      valuesSources: [],
    });
    const queryPlan = createQueryPlan(settings);
    it("should have empty aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of()));
    it("should have only a,b,c group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [[Set.of("a", "b", "c")]]));
  });

  describe("given query plan initialized by value columns: a,b,c where b is number", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: [],
      columnsSource: [],
      valuesSources: ["a", "b", "c"],
    });
    const queryPlan = createQueryPlan(settings, col => col === "b");
    it("should have b aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("b")));
    it("should have only a,c group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [[Set.of("a", "c")]]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d,e where all values are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: [],
      valuesSources: ["d", "e"],
    });
    const queryPlan = createQueryPlan(settings);
    it("should have d, e aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("d", "e")));
    it("should have a,b,c group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [[Set.of("a", "b", "c")]]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d,e where e is number", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: [],
      valuesSources: ["d", "e"],
    });
    const queryPlan = createQueryPlan(settings, col => col === "e");
    it("should have e aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("e")));
    it("should have a,b,c,d group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "d")],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d,e and show totals for a,c where all values are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: [],
      valuesSources: ["d", "e"],
      columnNameToMetadata: {
        a: { showTotals: true },
        c: { showTotals: true },
      },
    });
    const queryPlan = createQueryPlan(settings);
    it("should have d,e aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("e", "d")));
    it("should have a,b,c and a,b and empty groups", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c")],
        [Set.of("a", "b")],
        [Set.of()],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d,e and show totals for a,c where a,d are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: [],
      valuesSources: ["d", "e"],
      columnNameToMetadata: {
        a: { showTotals: true },
        c: { showTotals: true },
      },
    });
    const queryPlan = createQueryPlan(
      settings,
      col => col === "d" || col === "a",
    );
    it("should have d,e aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("d")));
    it("should have a,b,c,e and a,b,c and a,b and empty groups", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "e")],
        [Set.of("a", "b")],
        [Set.of()],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d and pivot for e and totals for a,b where all values are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: ["e"],
      valuesSources: ["d"],
      columnNameToMetadata: {
        b: { showTotals: true },
        a: { showTotals: true },
      },
    });
    const queryPlan = createQueryPlan(settings);
    it("should have d aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("d")));
    it("should have e and a,e and a,b,c,e groups", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "e")],
        [Set.of("a", "e")],
        [Set.of("e")],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d and pivot for e and totals for a,b where e is number", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: ["e"],
      valuesSources: ["d"],
      columnNameToMetadata: {
        b: { showTotals: true },
        a: { showTotals: true },
      },
    });
    const queryPlan = createQueryPlan(settings, col => col === "e");
    it("should have empty aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of()));
    it("should have a,b,c,d,e group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "d", "e")],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d, f and pivot for e and totals for a,c, e where all values are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: ["e"],
      valuesSources: ["d", "f"],
      columnNameToMetadata: {
        a: { showTotals: true },
        c: { showTotals: true },
        e: { showTotals: true },
      },
    });

    const queryPlan = createQueryPlan(settings);
    it("should have d,f aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("f", "d")));
    it("should have a,b,c,e;c,b,a and a,b;e,a,b and a;empty groups", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "e"), Set.of("c", "b", "a")],
        [Set.of("a", "b"), Set.of("e", "a", "b")],
        [Set.of(), Set.of("e")],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d, f and pivot for e and totals for a,c, e where c, f are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: ["e"],
      valuesSources: ["d", "f"],
      columnNameToMetadata: {
        a: { showTotals: true },
        c: { showTotals: true },
        e: { showTotals: true },
      },
    });

    const queryPlan = createQueryPlan(
      settings,
      col => col === "c" || col === "f",
    );
    it("should have f aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of("f")));
    it("should have a,b,c,d,e;c,b,a and a,b;e,a,b and a;empty groups", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "e", "d"), Set.of("c", "b", "a")],
        [Set.of("a", "b"), Set.of("e", "a", "b")],
        [Set.of(), Set.of("e")],
      ]));
  });

  describe("given query plan initialized by grouped columns: a,b,c and values: d, f and pivot for e and totals for a,c, e where a, c are numbers", () => {
    const settings: SummaryTableSettings = toValidSettings({
      groupsSources: ["a", "b", "c"],
      columnsSource: ["e"],
      valuesSources: ["d", "f"],
      columnNameToMetadata: {
        a: { showTotals: true },
        c: { showTotals: true },
        e: { showTotals: true },
      },
    });

    const queryPlan = createQueryPlan(
      settings,
      col => col === "c" || col === "a",
    );
    it("should have empty aggregation", () =>
      setsExpectToBeEqual(queryPlan.aggregations, Set.of()));
    it("should have a,b,c,d,e,f group", () =>
      groupingsExpectToEqual(queryPlan.groupings, [
        [Set.of("a", "b", "c", "e", "f", "d")],
      ]));
  });
});
