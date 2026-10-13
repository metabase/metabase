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
import type { AnalysisSettingsByKind, SpecResult } from "./types";

type SetupOpts<K extends AnalysisKind> = {
  kind: K;
  stored?: StoredSettings;
  table?: Table;
};

const setup = <K extends AnalysisKind>({
  kind,
  stored = {},
  table,
}: SetupOpts<K>) => {
  const config = getAnalysisConfig(kind);
  const context = { table };
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
  return { computed, specResult, allocation, isHidden, getProps };
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

/** The events each analysis needs to run, which have no defaults. */
const REQUIRED_EVENTS: Record<AnalysisKind, StoredSettings> = {
  funnel: { "funnel.steps": [SIGNED_UP, PURCHASED] },
  paths: { "paths.start": SIGNED_UP },
  habit: { "habit.active": SIGNED_UP },
  lifecycle: { "lifecycle.active": SIGNED_UP },
  cohorts: { "cohorts.start": SIGNED_UP, "cohorts.return": PURCHASED },
};

const EVENT_TABLE = createMockTable({
  fields: [
    createMockField({ id: 1, name: "event_id", base_type: "type/Text" }),
    createMockField({ id: 2, name: "user_id", base_type: "type/Text" }),
    createMockField({ id: 3, name: "ts", base_type: "type/DateTime" }),
    createMockField({ id: 4, name: "event_name", base_type: "type/Text" }),
  ],
});

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
    expect(setup({ kind: "habit" }).isHidden("granularity")).toBe(true);
    expect(
      setup({ kind: "habit", stored: { granularity: "day" } }).computed
        .granularity,
    ).toBe("week");
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

  it("derives the habit threshold default from the sub-period", () => {
    const { computed, isHidden } = setup({
      kind: "habit",
      stored: { "habit.sub_period": "week", "habit.measure": "threshold" },
    });

    expect(computed["habit.threshold"]).toBe(2);
    expect(isHidden("habit.threshold")).toBe(false);
    expect(setup({ kind: "habit" }).isHidden("habit.threshold")).toBe(true);
  });

  it("derives the cohorts horizon default from the granularity", () => {
    expect(
      setup({ kind: "cohorts", stored: { granularity: "month" } }).computed[
        "cohorts.horizon"
      ],
    ).toBe(6);
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
      { kind: "cohorts", key: "cohorts.start" },
      { kind: "cohorts", key: "cohorts.return" },
    ] as const)(
      "reports $key as missing when it has no event",
      ({ kind, key }) => {
        const { computed, specResult, allocation } = setup({
          kind,
          stored: { ...REQUIRED_EVENTS[kind], [key]: null },
        });

        expect(computed).toHaveProperty([key], null);
        expect(getMissingKeys(specResult)).toEqual([key]);
        expect(allocation.events).toHaveLength(0);
      },
    );

    it("reports every missing event at once", () => {
      const { specResult } = setup({
        kind: "cohorts",
        stored: { "cohorts.start": null, "cohorts.return": null },
      });

      expect(getMissingKeys(specResult)).toEqual([
        "cohorts.start",
        "cohorts.return",
      ]);
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
      });

      expect(spec.paths?.end).toBeNull();
      expect(built.sql).toContain("0 AS is_end");
    });
  });
});
