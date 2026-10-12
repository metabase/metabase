import { registerVisualizations } from "metabase/visualizations/register";
import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { buildSql } from "../build-sql";
import { allocateFlags } from "../events/allocate-flags";
import { SAVED_EVENTS } from "../events/catalog";
import { computeSettings, getSettingWidgets } from "../settings/compute";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";

import { ANALYSIS_KINDS, getAnalysisConfig } from "./config";
import type { AnalysisSettingsByKind } from "./types";

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
  const context = { table, savedEvents: SAVED_EVENTS };
  const computed = computeSettings(config.settings, context, stored);
  const eventIds = config.getEventRefs(computed).map(({ id }) => id);
  const allocation = allocateFlags(eventIds, SAVED_EVENTS);
  const spec = config.toSpec(computed, allocation);
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
  return { computed, spec, allocation, isHidden, getProps };
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
    const { spec, allocation } = setup({ kind });
    const built = buildSql(spec, "SELECT 1", {
      columns: {
        timestamp: "created_at",
        person: "person_id",
        session: "session_id",
        event_id: "event_id",
        event_name: "event_name",
        url_path: "url_path",
      },
      flags: allocation.events.map(({ flag }) => flag),
    });

    expect(built.sql).toContain("WITH events_base AS");
  });

  it("falls back to defaults for invalid stored values", () => {
    const { computed } = setup({
      kind: "funnel",
      stored: {
        "funnel.steps": [{ type: "saved", id: "pricing" }],
        "funnel.window": { value: -1, unit: "day" },
        "funnel.view": "sideways",
        "funnel.allow_retry": "yes",
        counting: null,
      },
    });

    expect(computed["funnel.steps"]).toHaveLength(3);
    expect(computed["funnel.window"]).toEqual({ value: 30, unit: "day" });
    expect(computed["funnel.view"]).toBe("steps");
    expect(computed["funnel.allow_retry"]).toBe(false);
    expect(computed.counting).toBe("person");
  });

  it("keeps valid stored values", () => {
    const { spec } = setup({
      kind: "funnel",
      stored: {
        "funnel.steps": [
          { type: "saved", id: "signup" },
          { type: "saved", id: "checkout" },
        ],
        granularity: "day",
      },
    });

    expect(spec.funnel?.steps).toEqual([
      { index: 0, flag: "ev_4", label: "Signed up" },
      { index: 1, flag: "ev_3", label: "Purchased" },
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
});
