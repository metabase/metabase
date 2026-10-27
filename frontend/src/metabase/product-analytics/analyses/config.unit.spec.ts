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
    "cohorts.start": SIGNED_UP,
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

const SESSION_TABLE = createMockTable({
  ...EVENT_TABLE,
  fields: [
    ...(EVENT_TABLE.fields ?? []),
    createMockField({ id: 9, name: "session_id", base_type: "type/Text" }),
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
        "funnel.ordering": "backwards",
        counting: null,
      },
    });

    expect(computed["funnel.steps"]).toEqual([]);
    expect(computed["funnel.window"]).toEqual({ value: 7, unit: "day" });
    expect(computed["funnel.view"]).toBe("steps");
    expect(computed["funnel.ordering"]).toBe("loose");
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

  describe("funnel disqualifiers", () => {
    const STARTED_TRIAL = createMockEventDefinition({ name: "Started trial" });
    const HIT_AN_ERROR = createMockEventDefinition({ name: "Hit an error" });
    const CANCELLED = createMockEventDefinition({ name: "Cancelled" });
    const stored = {
      "funnel.steps": [SIGNED_UP, STARTED_TRIAL, PURCHASED],
      "funnel.disqualifiers": [
        { event: HIT_AN_ERROR, between: null },
        { event: CANCELLED, between: { fromStep: 1, toStep: 5 } },
      ],
    };

    it("disqualify anywhere in the funnel, or between steps up to the last", () => {
      const { specResult, isHidden } = setup({ kind: "funnel", stored });

      expect(isHidden("funnel.disqualifiers")).toBe(false);
      expect(getReadySpec(specResult).funnel?.exclusions).toEqual([
        { flag: "ev_4", fromStep: 0, toStep: 2 },
        { flag: "ev_5", fromStep: 1, toStep: 2 },
      ]);
    });

    it.each(["strict", "any"])(
      "are hidden and left out in %s order",
      (ordering) => {
        const { specResult, isHidden } = setup({
          kind: "funnel",
          stored: { ...stored, "funnel.ordering": ordering },
        });

        expect(isHidden("funnel.disqualifiers")).toBe(true);
        expect(getReadySpec(specResult).funnel?.exclusions).toEqual([]);
      },
    );

    it("fall back to none when a range is backwards", () => {
      const { computed } = setup({
        kind: "funnel",
        stored: {
          ...stored,
          "funnel.disqualifiers": [
            { event: HIT_AN_ERROR, between: { fromStep: 2, toStep: 1 } },
          ],
        },
      });

      expect(computed["funnel.disqualifiers"]).toEqual([]);
    });
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
      kind: "lifecycle",
      table: EVENT_TABLE,
      stored: { counting: "session" },
    });

    expect(getProps("counting")).toEqual({
      options: ["person", "event"],
      isDisabled: false,
    });
    expect(computed.counting).toBe("person");
  });

  it.each([
    { kind: "funnel", options: ["person", "session"] },
    { kind: "paths", options: ["session", "person"] },
    { kind: "habit", options: ["person"] },
    { kind: "lifecycle", options: ["person", "session", "event"] },
    { kind: "cohorts", options: ["person"] },
  ] as const)("offers $kind counting by $options", ({ kind, options }) => {
    const { computed, getProps } = setup({ kind, table: SESSION_TABLE });

    expect(getProps("counting")).toEqual({ options, isDisabled: false });
    expect(computed.counting).toBe(options[0]);
  });

  it("disables counting until a table is picked", () => {
    expect(setup({ kind: "funnel" }).getProps("counting")).toMatchObject({
      isDisabled: true,
    });
  });

  it("drops a stored counting the analysis doesn't offer", () => {
    const { computed } = setup({
      kind: "funnel",
      table: SESSION_TABLE,
      stored: { counting: "event" },
    });

    expect(computed.counting).toBe("person");
  });

  describe("lifecycle counting", () => {
    it.each(["person", "session", "event"] as const)(
      "follows people, adding up their %s",
      (counting) => {
        const { specResult } = setup({
          kind: "lifecycle",
          table: SESSION_TABLE,
          stored: { counting },
        });
        const spec = getReadySpec(specResult);

        expect(spec.grain).toBe("person");
        expect(spec.lifecycle?.counted).toBe(counting);
      },
    );

    it("shows the sessions dormant people had the period before as negative", () => {
      const { specResult, allocation } = setup({
        kind: "lifecycle",
        table: SESSION_TABLE,
        stored: { counting: "session" },
      });
      const built = buildSql(getReadySpec(specResult), "SELECT 1", {
        columns: PLANNER_COLUMNS,
        flags: allocation.events.map(({ flag }) => flag),
        extraColumns: [],
      });
      const getCte = (name: string) =>
        built.ctes.find((cte) => cte.name === name)?.body ?? "";

      expect(getCte("actor_periods")).toContain("uniqExact(session) AS amount");
      expect(getCte("went_quiet")).toContain("sum(amount) AS amount");
      expect(built.sql).toContain("-amount AS value");
    });
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

  it("finds when people were first seen for lifecycle by the column's name", () => {
    const table = createMockTable({
      ...EVENT_TABLE,
      fields: [
        ...(EVENT_TABLE.fields ?? []),
        createMockField({
          id: 8,
          name: "person__first_seen_at",
          base_type: "type/DateTime",
        }),
      ],
    });
    const withColumn = setup({ kind: "lifecycle", table });
    const withoutColumn = setup({ kind: "lifecycle", table: EVENT_TABLE });

    expect(getReadySpec(withColumn.specResult).lifecycle?.hasFirstSeen).toBe(
      true,
    );
    expect(withColumn.extraColumns).toEqual([
      { as: "first_seen", column: "person__first_seen_at", from: "events" },
    ]);
    expect(getReadySpec(withoutColumn.specResult).lifecycle?.hasFirstSeen).toBe(
      false,
    );
    expect(withoutColumn.extraColumns).toEqual([]);
  });

  describe("cohorts", () => {
    it("starts and returns on any event by default", () => {
      const { specResult, extraColumns } = setup({ kind: "cohorts" });
      const spec = getReadySpec(specResult);

      expect(spec.cohorts?.start).toBeUndefined();
      expect(spec.cohorts?.return).toBeUndefined();
      expect(spec.breakout).toBeUndefined();
      expect(extraColumns).toEqual([]);
    });

    it("gives the start and return events their own flags", () => {
      const { specResult } = setup({
        kind: "cohorts",
        stored: REQUIRED_EVENTS.cohorts,
      });

      expect(getReadySpec(specResult).cohorts).toMatchObject({
        start: { flag: "ev_1" },
        return: { flag: "ev_2" },
      });
    });

    it("offers the event table's user properties when there is no users table", () => {
      const { getProps } = setup({ kind: "cohorts", table: EVENT_TABLE });

      expect(getProps("breakout")).toMatchObject({
        columns: [{ value: "plan" }],
      });
    });

    it("offers the users table's columns when the person column links to one", () => {
      const { getProps, computed, extraColumns } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        usersTable: USERS_TABLE_CONTEXT,
        stored: { breakout: { type: "property", column: "country" } },
      });

      expect(getProps("breakout")).toMatchObject({
        columns: [{ value: "country" }, { value: "plan" }],
      });
      expect(computed["breakout"]).toEqual({
        type: "property",
        column: "country",
      });
      expect(extraColumns).toEqual([
        { as: "breakout_property", column: "country", from: "users" },
      ]);
    });

    it("drops a stored attribute the users table doesn't have", () => {
      const { computed } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        usersTable: USERS_TABLE_CONTEXT,
        stored: { breakout: { type: "property", column: "event_name" } },
      });

      expect(computed["breakout"]).toBeNull();
    });

    it("groups by the attribute when one is picked", () => {
      const { specResult } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        stored: { breakout: { type: "property", column: "plan" } },
      });

      expect(getReadySpec(specResult).breakout).toEqual({ type: "property" });
    });

    it("defaults to returning in exactly that period, named by the granularity", () => {
      const { computed, getProps, widgets } = setup({
        kind: "cohorts",
        stored: { granularity: "month" },
      });

      expect(computed["cohorts.return_rule"]).toBe("exactly");
      expect(
        widgets.find((widget) => widget.id === "cohorts.return_rule")?.title,
      ).toBe("Counts as retained if they return…");
      expect(getProps("cohorts.return_rule")).toMatchObject({
        data: [
          { label: "In that month", value: "exactly" },
          { label: "In that month or later", value: "onOrAfter" },
        ],
      });
    });

    it("shows a table with a row per cohort by default, without the line chart's settings", () => {
      const config = getAnalysisConfig("cohorts");
      const { computed, specResult, isHidden } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        stored: { "cohorts.lines": "average", "cohorts.display": "counts" },
      });

      expect(getReadySpec(specResult).output.cohortsLines).toBe("each");
      expect(config.getDisplay(computed)).toBe("cohort");
      expect(config.getVizSettings(computed, {})).toEqual({
        "cohort.period": "week",
        "cohort.value_format": "counts",
        "cohort.tooltip_columns": [
          { name: "avg_events", title: "Events per returning person" },
        ],
      });
      expect(isHidden("cohorts.lines")).toBe(true);
      expect(isHidden("cohorts.x_axis")).toBe(true);
      expect(isHidden("cohorts.display")).toBe(false);
    });

    it("draws a line per cohort over the weeks since each start", () => {
      const config = getAnalysisConfig("cohorts");
      const { computed, specResult } = setup({
        kind: "cohorts",
        stored: { "cohorts.view": "curves" },
      });

      expect(getReadySpec(specResult).output.cohortsLines).toBe("each");
      expect(config.getDisplay(computed)).toBe("line");
      expect(config.getVizSettings(computed, {})).toMatchObject({
        "graph.dimensions": ["offset", "cohort"],
        "graph.x_axis.title_text": "Weeks since start",
      });
    });

    it("draws one line for the average of every cohort", () => {
      const config = getAnalysisConfig("cohorts");
      const { computed, specResult } = setup({
        kind: "cohorts",
        stored: { "cohorts.view": "curves", "cohorts.lines": "average" },
      });

      expect(getReadySpec(specResult).output.cohortsLines).toBe("average");
      expect(config.getVizSettings(computed, {})["graph.dimensions"]).toEqual([
        "offset",
      ]);
    });

    it("draws a line per value when grouped by an attribute", () => {
      const config = getAnalysisConfig("cohorts");
      const { computed, specResult, isHidden } = setup({
        kind: "cohorts",
        table: EVENT_TABLE,
        stored: {
          "cohorts.view": "curves",
          breakout: { type: "property", column: "plan" },
          "cohorts.lines": "average",
        },
      });

      expect(isHidden("cohorts.lines")).toBe(true);
      expect(getReadySpec(specResult).output.cohortsLines).toBe("each");
      expect(config.getVizSettings(computed, {})["graph.dimensions"]).toEqual([
        "offset",
        "cohort",
      ]);
    });

    it("only offers dates along the x-axis for each cohort returning in exactly that period", () => {
      const isDateAxisHidden = (stored: StoredSettings) =>
        setup({
          kind: "cohorts",
          table: EVENT_TABLE,
          stored: { "cohorts.view": "curves", ...stored },
        }).isHidden("cohorts.x_axis");

      expect(isDateAxisHidden({})).toBe(false);
      expect(isDateAxisHidden({ "cohorts.return_rule": "onOrAfter" })).toBe(
        true,
      );
      expect(isDateAxisHidden({ "cohorts.lines": "average" })).toBe(true);
      expect(
        isDateAxisHidden({ breakout: { type: "property", column: "plan" } }),
      ).toBe(true);
    });

    it("plots each cohort by date, and stacks counts", () => {
      const config = getAnalysisConfig("cohorts");
      const byDate = (stored: StoredSettings) => {
        const { computed } = setup({
          kind: "cohorts",
          stored: {
            "cohorts.view": "curves",
            "cohorts.x_axis": "date",
            ...stored,
          },
        });
        return {
          display: config.getDisplay(computed),
          settings: config.getVizSettings(computed, {}),
        };
      };

      const percent = byDate({});
      expect(percent.display).toBe("line");
      expect(percent.settings).toMatchObject({
        "graph.dimensions": ["date", "cohort"],
        "graph.x_axis.scale": "timeseries",
      });
      expect(percent.settings["stackable.stack_type"]).toBeUndefined();

      const counts = byDate({ "cohorts.display": "counts" });
      expect(counts.display).toBe("area");
      expect(counts.settings["stackable.stack_type"]).toBe("stacked");
    });

    it("keeps the weeks since start once dates no longer apply", () => {
      const config = getAnalysisConfig("cohorts");
      const { computed } = setup({
        kind: "cohorts",
        stored: {
          "cohorts.view": "curves",
          "cohorts.x_axis": "date",
          "cohorts.display": "counts",
          "cohorts.return_rule": "onOrAfter",
        },
      });

      expect(config.getDisplay(computed)).toBe("line");
      expect(config.getVizSettings(computed, {})["graph.dimensions"]).toEqual([
        "offset",
        "cohort",
      ]);
    });
  });

  it("adds each bar's events and sessions per active day to the habit tooltip", () => {
    const { computed } = setup({ kind: "habit", table: SESSION_TABLE });
    const settings = getAnalysisConfig("habit").getVizSettings(computed, {});

    expect(settings["graph.tooltip_columns"]).toEqual([
      '["name","avg_events"]',
      '["name","avg_sessions"]',
    ]);
    expect(settings.column_settings?.['["name","avg_sessions"]']).toEqual({
      decimals: 1,
      column_title: "Sessions per active day",
    });
  });

  describe("paths visits", () => {
    const getVisitsSql = (stored: StoredSettings, table: Table) => {
      const { specResult, allocation } = setup({
        kind: "paths",
        stored,
        table,
      });
      const built = buildSql(getReadySpec(specResult), "SELECT 1", {
        columns: PLANNER_COLUMNS,
        flags: allocation.events.map(({ flag }) => flag),
        extraColumns: [],
      });
      return {
        visits: built.ctes.find(({ name }) => name === "visits")?.body ?? "",
        sql: built.sql,
      };
    };

    it("counts sessions, each one a visit, when the table has sessions", () => {
      const { computed, isHidden, specResult } = setup({
        kind: "paths",
        table: SESSION_TABLE,
      });
      const { visits, sql } = getVisitsSql({}, SESSION_TABLE);

      expect(computed.counting).toBe("session");
      expect(isHidden("paths.visit")).toBe(false);
      expect(isHidden("paths.inactivity")).toBe(true);
      expect(getReadySpec(specResult).paths?.visit).toEqual({
        kind: "session",
      });
      expect(visits).toContain("0 AS visit");
      expect(sql).toContain("count() AS weight");
    });

    it("splits sessions at breaks in activity, counting each piece", () => {
      const { visits, sql } = getVisitsSql(
        {
          "paths.visit": "inactivity",
          "paths.inactivity": { value: 2, unit: "hour" },
        },
        SESSION_TABLE,
      );

      expect(visits).toContain("ts) > 7200");
      expect(sql).toContain("count() AS weight");
    });

    it("follows people through their sessions", () => {
      const { visits, sql } = getVisitsSql(
        { counting: "person" },
        SESSION_TABLE,
      );

      expect(visits).toContain("session AS visit");
      expect(sql).toContain("session_id AS session");
      expect(sql).toContain("uniqExact(actor) AS weight");
    });

    it("ends visits at a break in activity without a session column", () => {
      const { computed, isHidden, specResult } = setup({
        kind: "paths",
        table: EVENT_TABLE,
        stored: { "paths.visit": "session" },
      });

      expect(computed.counting).toBe("person");
      expect(isHidden("paths.visit")).toBe(true);
      expect(isHidden("paths.inactivity")).toBe(false);
      expect(getReadySpec(specResult).paths?.visit).toEqual({
        kind: "inactivity",
        gap: { value: 30, unit: "minute" },
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

  describe("pageviews", () => {
    const PAGEVIEW = createMockEventDefinition({ name: "Pageview" });

    const getPathsSql = (stored: StoredSettings) => {
      const { specResult, allocation } = setup({
        kind: "paths",
        stored: { ...REQUIRED_EVENTS.paths, ...stored },
      });
      const spec = getReadySpec(specResult);
      const built = buildSql(spec, "SELECT 1", {
        columns: PLANNER_COLUMNS,
        flags: allocation.events.map(({ flag }) => flag),
        extraColumns: [],
      });
      return { spec, sql: built.sql };
    };

    it("defaults to the pageviews detected in the table", () => {
      const config = getAnalysisConfig("paths");
      const computed = computeSettings(
        config.settings,
        {
          table: EVENT_TABLE,
          usersTable: undefined,
          detectedPageviews: PAGEVIEW,
        },
        {},
      );

      expect(computed.pageviews).toEqual(PAGEVIEW);
    });

    it("defaults to none when the table has no pageviews we recognize", () => {
      const { computed } = setup({ kind: "paths", table: EVENT_TABLE });

      expect(computed.pageviews).toBeNull();
    });

    it("names pageviews by their URL path", () => {
      const { spec, sql } = getPathsSql({
        pageviews: PAGEVIEW,
        "columns.url_path": "path",
      });

      expect(spec.pageview).toEqual({ flag: "ev_2" });
      expect(sql).toContain(
        "if(ev_2, url_path, ifNull(event_name, '')) AS step_name",
      );
    });

    it("names pageviews like other events without a URL path column", () => {
      const { spec, sql } = getPathsSql({ pageviews: PAGEVIEW });

      expect(spec.pageview).toBeUndefined();
      expect(sql).toContain("ifNull(event_name, '') AS step_name");
      expect(sql).not.toContain("url_path, ifNull");
    });
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
      expect(allocation.events.map(({ event }) => event)).toEqual([SIGNED_UP]);
    });

    it.each(["from", "to", "between"])(
      "runs %s paths without events, from a visit's first step to its last",
      (direction) => {
        const { specResult } = setup({
          kind: "paths",
          stored: { "paths.direction": direction },
        });
        const spec = getReadySpec(specResult);

        expect(spec.paths?.start).toBeNull();
        expect(spec.paths?.end).toBeNull();
      },
    );

    it("bounds paths by the visit when they have no events", () => {
      const getBoundsSql = (direction: string) => {
        const { specResult } = setup({
          kind: "paths",
          stored: { "paths.direction": direction },
        });
        const built = buildSql(getReadySpec(specResult), "SELECT 1", {
          columns: PLANNER_COLUMNS,
          flags: [],
          extraColumns: [],
        });
        return built.ctes.find(({ name }) => name === "bounds")?.body ?? "";
      };

      expect(getBoundsSql("from")).not.toContain("is_start");
      expect(getBoundsSql("to")).toContain(
        "toInt64(max(position)) AS last_position",
      );
      expect(getBoundsSql("to")).not.toContain("is_end");
      expect(getBoundsSql("between")).toContain("max(o.position)");
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
