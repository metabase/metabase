import { registerVisualizations } from "metabase/visualizations/register";
import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { buildSql } from "../build-sql";
import { createFlagAllocator } from "../events/allocate-flags";
import { createMockEventDefinition } from "../events/mocks";
import { computeSettings, getSettingWidgets } from "../settings/compute";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";

import { ANALYSIS_KINDS, getAnalysisConfig } from "./config";
import type {
  AnalysisContext,
  AnalysisSettingsByKind,
  SpecResult,
  UsersTable,
} from "./types";

type SetupOpts<K extends AnalysisKind> = {
  kind: K;
  stored?: StoredSettings;
  table?: Table;
  usersTable?: UsersTable;
};

const setup = <K extends AnalysisKind>({
  kind,
  stored = {},
  table,
  usersTable,
}: SetupOpts<K>) => {
  const config = getAnalysisConfig(kind);
  const context: AnalysisContext = { table, usersTable };
  const computed = computeSettings(config.settings, context, stored);
  const allocation = createFlagAllocator();
  const specResult = config.toSpec(computed, allocation);
  const widgets = getSettingWidgets(
    config.settings,
    context,
    stored,
    computed,
    jest.fn<void, [Partial<AnalysisSettingsByKind[K]>]>(),
  );
  const isHidden = (id: string) =>
    widgets.find((widget) => widget.id === id)?.hidden;
  const getProps = (id: string) =>
    widgets.find((widget) => widget.id === id)?.props;
  const extraColumns = config.getExtraColumns?.(computed, context) ?? [];
  return {
    computed,
    specResult,
    allocation,
    widgets,
    isHidden,
    getProps,
    extraColumns,
  };
};

const getReadySpec = (result: SpecResult) => {
  if (result.status !== "ready") {
    throw new Error(
      `Expected a ready spec, missing: ${result.missing.map(({ key }) => key)}`,
    );
  }
  return result.spec;
};

const getMissingKeys = (result: SpecResult) =>
  result.status === "incomplete" ? result.missing.map(({ key }) => key) : [];

const PLANNER_COLUMNS = {
  timestamp: "created_at",
  person: "person_id",
  session: "session_id",
  event_id: "event_id",
  event_name: "event_name",
  url_path: "url_path",
};

const SIGNED_UP = createMockEventDefinition({ name: "Signed up" });
const PURCHASED = createMockEventDefinition({ name: "Purchased" });

/** What each analysis needs to run that has no default without a table. */
const REQUIRED_EVENTS: Record<AnalysisKind, StoredSettings> = {
  funnel: { "funnel.steps": [SIGNED_UP, PURCHASED] },
  paths: { "paths.start": SIGNED_UP },
  habit: { "habit.active": SIGNED_UP },
  lifecycle: { "lifecycle.active": SIGNED_UP },
  cohorts: {
    "cohorts.start_column": "created_at",
    "cohorts.return": PURCHASED,
  },
};

const EVENT_TABLE = createMockTable({
  id: 10,
  fields: [
    createMockField({ id: 1, name: "event_id", base_type: "type/Text" }),
    createMockField({ id: 2, name: "user_id", base_type: "type/Text" }),
    createMockField({ id: 3, name: "ts", base_type: "type/DateTime" }),
    createMockField({ id: 4, name: "event_name", base_type: "type/Text" }),
    createMockField({ id: 5, name: "plan", base_type: "type/Text" }),
    createMockField({
      id: 6,
      name: "signed_up_at",
      base_type: "type/DateTime",
    }),
    createMockField({ id: 7, name: "amount", base_type: "type/Float" }),
  ],
});

const USERS_TABLE = createMockTable({
  id: 20,
  fields: [
    createMockField({
      id: 21,
      name: "id",
      base_type: "type/Text",
      semantic_type: "type/PK",
    }),
    createMockField({ id: 22, name: "country", base_type: "type/Text" }),
    createMockField({ id: 23, name: "plan", base_type: "type/Text" }),
  ],
});

const USERS_TABLE_CONTEXT: UsersTable = {
  link: { tableId: USERS_TABLE.id, foreignKey: "user_id", primaryKey: "id" },
  table: USERS_TABLE,
};

describe("analysis settings", () => {
  beforeAll(() => {
    registerVisualizations();
  });

  it.each(ANALYSIS_KINDS)("compiles the %s defaults to SQL", (kind) => {
    const { specResult, allocation } = setup({
      kind,
      stored: REQUIRED_EVENTS[kind],
    });
    const built = buildSql(getReadySpec(specResult), "SELECT 1", {
      columns: PLANNER_COLUMNS,
      flags: allocation.events.map(({ flag }) => flag),
      extraColumns: [],
    });

    expect(built.sql).toContain("WITH events_base AS");
  });

  it("falls back to defaults for invalid stored values", () => {
    const { computed } = setup({
      kind: "funnel",
      stored: {
        "funnel.steps": [{ name: "No query" }],
        "funnel.window": { value: -1, unit: "day" },
        "funnel.view": "sideways",
        "funnel.allow_retry": "yes",
        counting: null,
      },
    });

    expect(computed["funnel.steps"]).toEqual([]);
    expect(computed["funnel.window"]).toEqual({ value: 7, unit: "day" });
    expect(computed["funnel.view"]).toBe("steps");
    expect(computed["funnel.allow_retry"]).toBe(false);
    expect(computed.counting).toBe("person");
  });

  it.each([
    { query: {} },
    { query: [] },
    { query: { database: 1, stages: [] } },
    { query: null },
    { name: " ", query: SIGNED_UP.query },
  ])("drops a malformed stored event: %j", (event) => {
    const { computed } = setup({
      kind: "habit",
      stored: { "habit.active": { name: "Signed up", ...event } },
    });

    expect(computed["habit.active"]).toBeNull();
  });

  it("keeps valid stored values", () => {
    const { specResult } = setup({
      kind: "funnel",
      stored: {
        "funnel.steps": [SIGNED_UP, PURCHASED],
        granularity: "day",
      },
    });

    const spec = getReadySpec(specResult);
    expect(spec.funnel?.steps).toEqual([
      { index: 0, flag: "ev_1", label: "Signed up" },
      { index: 1, flag: "ev_2", label: "Purchased" },
    ]);
    expect(spec.bucket.granularity).toBe("day");
  });

  it("shows funnel granularity only for the over-time view", () => {
    expect(setup({ kind: "funnel" }).isHidden("granularity")).toBe(true);
    expect(
      setup({ kind: "funnel", stored: { "funnel.view": "overTime" } }).isHidden(
        "granularity",
      ),
    ).toBe(false);
  });

  it("hides granularity for analyses without a time grain", () => {
    expect(setup({ kind: "paths" }).isHidden("granularity")).toBe(true);
    expect(
      setup({ kind: "paths", stored: { granularity: "day" } }).computed
        .granularity,
    ).toBe("week");
  });

  it("limits habit granularity to days and weeks", () => {
    expect(setup({ kind: "habit" }).computed.granularity).toBe("day");
    expect(
      setup({ kind: "habit", stored: { granularity: "month" } }).computed
        .granularity,
    ).toBe("day");
  });

  it("only offers counting by columns the table has", () => {
    const { computed, getProps } = setup({
      kind: "funnel",
      table: EVENT_TABLE,
      stored: { counting: "session" },
    });

    expect(getProps("counting")).toEqual({ options: ["person", "event"] });
    expect(computed.counting).toBe("person");
  });

  it("picks column role defaults from the table", () => {
    const { computed } = setup({ kind: "funnel", table: EVENT_TABLE });

    expect(computed["columns.timestamp"]).toBe("ts");
    expect(computed["columns.person"]).toBe("user_id");
    expect(computed["columns.session"]).toBeNull();
    expect(computed["columns.event_id"]).toBe("event_id");
    expect(computed["columns.event_name"]).toBe("event_name");
    expect(computed["columns.url_path"]).toBeNull();
  });

  it("drops a stored column the table doesn't have", () => {
    const { computed } = setup({
      kind: "funnel",
      table: EVENT_TABLE,
      stored: { "columns.timestamp": "missing" },
    });

    expect(computed["columns.timestamp"]).toBe("ts");
  });

  it("derives the habit threshold default from the granularity", () => {
    const { computed, isHidden } = setup({
      kind: "habit",
      stored: { granularity: "week", "habit.measure": "threshold" },
    });

    expect(computed["habit.threshold"]).toBe(2);
    expect(isHidden("habit.threshold")).toBe(false);
    expect(setup({ kind: "habit" }).isHidden("habit.threshold")).toBe(true);
  });

  it("counts habit sub-periods over the date range", () => {
    const { specResult } = setup({
      kind: "habit",
      stored: { granularity: "week", date_range: "past4weeks" },
    });

    expect(getReadySpec(specResult).habit).toMatchObject({
      subPeriod: "week",
      periods: 4,
    });
  });

  it("follows cohorts for as many periods as the date range spans", () => {
    const horizon = (stored: StoredSettings) =>
      setup({ kind: "cohorts", stored }).computed["cohorts.horizon"];

    expect(horizon({})).toBe(13);
    expect(horizon({ granularity: "month" })).toBe(3);
    expect(horizon({ granularity: "day" })).toBe(90);
    expect(horizon({ date_range: "past4weeks" })).toBe(4);
    expect(horizon({ date_range: "2026-01-01~2026-03-31" })).toBe(13);
  });

  it("falls back to a fixed horizon for an open-ended date range", () => {
    expect(
      setup({ kind: "cohorts", stored: { date_range: "2026-01-01~" } })
        .computed["cohorts.horizon"],
    ).toBe(8);
  });

  it("names the granularity in the horizon title", () => {
    const { widgets } = setup({
      kind: "cohorts",
      stored: { granularity: "month" },
    });

    expect(
      widgets.find((widget) => widget.id === "cohorts.horizon")?.title,
    ).toBe("Months to follow");
  });

  describe("cohorts", () => {
    it("starts cohorts from the event time column by default", () => {
      const { computed, extraColumns, getProps } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
      });

      expect(computed["cohorts.by"]).toBe("startDate");
      expect(computed["cohorts.start_column"]).toBe("ts");
      expect(getProps("cohorts.start_column")).toMatchObject({
        columns: [{ value: "ts" }, { value: "signed_up_at" }],
      });
      expect(extraColumns).toEqual([
        { as: "cohort_start", column: "ts", from: "events" },
      ]);
    });

    it("drops a stored start column that isn't a date", () => {
      const { computed } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        stored: { "cohorts.start_column": "plan" },
      });

      expect(computed["cohorts.start_column"]).toBe("ts");
    });

    it("shows the start column or the attribute by cohort type", () => {
      const byStartDate = setup({ kind: "cohorts" });
      expect(byStartDate.isHidden("cohorts.start_column")).toBe(false);
      expect(byStartDate.isHidden("cohorts.attribute")).toBe(true);

      const byAttribute = setup({
        kind: "cohorts",
        stored: { "cohorts.by": "attribute" },
      });
      expect(byAttribute.isHidden("cohorts.start_column")).toBe(true);
      expect(byAttribute.isHidden("cohorts.attribute")).toBe(false);
    });

    it("offers the event table's user properties when there is no users table", () => {
      const { getProps } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        stored: { "cohorts.by": "attribute" },
      });

      expect(getProps("cohorts.attribute")).toMatchObject({
        columns: [{ value: "plan" }],
      });
    });

    it("offers the users table's columns when the person column links to one", () => {
      const { getProps, computed, extraColumns } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        usersTable: USERS_TABLE_CONTEXT,
        stored: { "cohorts.by": "attribute", "cohorts.attribute": "country" },
      });

      expect(getProps("cohorts.attribute")).toMatchObject({
        columns: [{ value: "country" }, { value: "plan" }],
      });
      expect(computed["cohorts.attribute"]).toBe("country");
      expect(extraColumns).toEqual([
        { as: "cohort_attribute", column: "country", from: "users" },
      ]);
    });

    it("drops a stored attribute the users table doesn't have", () => {
      const { computed } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        usersTable: USERS_TABLE_CONTEXT,
        stored: {
          "cohorts.by": "attribute",
          "cohorts.attribute": "event_name",
        },
      });

      expect(computed["cohorts.attribute"]).toBeNull();
    });

    it("groups by the attribute in the spec", () => {
      const { specResult } = setup({
        kind: "cohorts",
        stored: {
          ...REQUIRED_EVENTS.cohorts,
          "cohorts.by": "attribute",
          "cohorts.attribute": "plan",
        },
      });

      expect(getReadySpec(specResult).cohorts).toMatchObject({
        by: "attribute",
      });
    });

    it("names the granularity in the exact return rule", () => {
      const { getProps } = setup({
        kind: "cohorts",
        stored: { granularity: "month" },
      });

      expect(getProps("cohorts.return_rule")).toMatchObject({
        data: [
          { label: "Any time after", value: "onOrAfter" },
          { label: "In exactly 1 month", value: "exactly" },
        ],
      });
    });
  });

  it("hides the paths start or end event by direction", () => {
    const to = setup({ kind: "paths", stored: { "paths.direction": "to" } });
    expect(to.isHidden("paths.start")).toBe(true);
    expect(to.isHidden("paths.end")).toBe(false);

    const from = setup({ kind: "paths" });
    expect(from.isHidden("paths.start")).toBe(false);
    expect(from.isHidden("paths.end")).toBe(true);
  });

  describe("incomplete settings", () => {
    it("keeps a funnel with too few steps and reports it as incomplete", () => {
      const { computed, specResult } = setup({
        kind: "funnel",
        stored: { "funnel.steps": [SIGNED_UP] },
      });

      expect(computed["funnel.steps"]).toEqual([SIGNED_UP]);
      expect(getMissingKeys(specResult)).toEqual(["funnel.steps"]);
    });

    it.each([
      { kind: "habit", key: "habit.active" },
      { kind: "lifecycle", key: "lifecycle.active" },
    ] as const)("counts any event when $key is empty", ({ kind, key }) => {
      const { computed, specResult, allocation } = setup({
        kind,
        stored: { ...REQUIRED_EVENTS[kind], [key]: null },
      });

      expect(computed).toHaveProperty([key], null);
      expect(specResult.status).toBe("ready");
      expect(
        specResult.status === "ready" ? specResult.spec[kind]?.active : null,
      ).toBeUndefined();
      expect(allocation.events).toHaveLength(0);
    });

    it("keeps an empty lifecycle group list and reports it as incomplete", () => {
      const { computed, specResult } = setup({
        kind: "lifecycle",
        stored: { ...REQUIRED_EVENTS.lifecycle, "lifecycle.shown": [] },
      });

      expect(computed["lifecycle.shown"]).toEqual([]);
      expect(getMissingKeys(specResult)).toEqual(["lifecycle.shown"]);
    });

    it("counts any event as returning when cohorts have no return event", () => {
      const { specResult, allocation } = setup({
        kind: "cohorts",
        stored: { ...REQUIRED_EVENTS.cohorts, "cohorts.return": null },
      });

      expect(specResult.status).toBe("ready");
      expect(
        specResult.status === "ready" ? specResult.spec.cohorts?.return : null,
      ).toBeUndefined();
      expect(allocation.events).toHaveLength(0);
    });

    it("reports the missing cohorts attribute", () => {
      const { specResult } = setup({
        kind: "cohorts",
        stored: { "cohorts.by": "attribute", "cohorts.return": null },
      });

      expect(getMissingKeys(specResult)).toEqual(["cohorts.attribute"]);
    });

    it("only requires the paths events the direction uses", () => {
      const noEvents = { "paths.start": null, "paths.end": null };

      expect(
        getMissingKeys(
          setup({
            kind: "paths",
            stored: { ...noEvents, "paths.direction": "from" },
          }).specResult,
        ),
      ).toEqual(["paths.start"]);
      expect(
        getMissingKeys(
          setup({
            kind: "paths",
            stored: { ...noEvents, "paths.direction": "to" },
          }).specResult,
        ),
      ).toEqual(["paths.end"]);
      expect(
        getMissingKeys(
          setup({
            kind: "paths",
            stored: { ...noEvents, "paths.direction": "between" },
          }).specResult,
        ),
      ).toEqual(["paths.start", "paths.end"]);
    });

    it("leaves the event its direction hides out of the query", () => {
      const { specResult, allocation } = setup({
        kind: "paths",
        stored: {
          "paths.direction": "from",
          "paths.start": SIGNED_UP,
          "paths.end": PURCHASED,
        },
      });

      expect(getReadySpec(specResult).paths?.end).toBeNull();
      expect(allocation.events.map(({ event }) => event)).toEqual([SIGNED_UP]);
    });

    it("compiles paths without the event its direction doesn't use", () => {
      const { specResult, allocation } = setup({
        kind: "paths",
        stored: {
          ...REQUIRED_EVENTS.paths,
          "paths.direction": "from",
          "paths.end": null,
        },
      });
      const spec = getReadySpec(specResult);
      const built = buildSql(spec, "SELECT 1", {
        columns: PLANNER_COLUMNS,
        flags: allocation.events.map(({ flag }) => flag),
        extraColumns: [],
      });

      expect(spec.paths?.end).toBeNull();
      expect(built.sql).toContain("0 AS is_end");
    });
  });
});
