import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import {
  EVENT_TABLE_SETTINGS,
  getEventTableSections,
  getEventTableSettings,
  isEventTableSetUp,
} from "./event-table-settings";
import { EVERY_EVENT, type PageviewRule } from "./pageviews";
import { getDefaultPathCleaningRules } from "./path-cleaning";
import { getSettingWidgets } from "./settings/compute";

const TABLE = createMockTable({
  fields: [
    createMockField({ id: 1, name: "ts", base_type: "type/DateTime" }),
    createMockField({ id: 2, name: "user_id", base_type: "type/Text" }),
    createMockField({ id: 3, name: "event_name", base_type: "type/Text" }),
    createMockField({ id: 4, name: "path", base_type: "type/Text" }),
  ],
  detected_event_settings: {
    schema: "snowplow",
    settings: {
      "columns.timestamp": "ts",
      "columns.person": "user_id",
      "columns.event_name": "event_name",
    },
  },
});

const PAGEVIEW_RULE: PageviewRule = {
  type: "column_value",
  column: "event_type",
  value: 1,
};

const PAGES_TABLE = createMockTable({
  ...TABLE,
  fields: [
    ...(TABLE.fields ?? []),
    createMockField({ id: 5, name: "event_type", base_type: "type/Integer" }),
  ],
  detected_event_settings: {
    schema: "metabase-track",
    settings: {
      ...TABLE.detected_event_settings?.settings,
      "columns.url_path": "path",
      pageviews: PAGEVIEW_RULE,
    },
  },
});

type SetupOpts = {
  table?: Table;
  eventSettings?: Table["event_settings"];
};

const setup = ({
  table: baseTable = TABLE,
  eventSettings = {},
}: SetupOpts = {}) => {
  const table = { ...baseTable, event_settings: eventSettings };
  const settings = getEventTableSettings(table);
  const widgets = getSettingWidgets(
    EVENT_TABLE_SETTINGS,
    { table },
    eventSettings ?? {},
    settings,
    jest.fn(),
  ).filter((widget) => !widget.hidden);
  const sections = getEventTableSections(widgets).map((section) => ({
    id: section.id,
    widgetIds: section.widgets.map((widget) => widget.id),
  }));
  return { settings, sections };
};

describe("event table settings", () => {
  describe("sections", () => {
    it("shows the pages section with only the URL path until one is picked", () => {
      const { sections } = setup();

      expect(sections).toEqual([
        {
          id: "required_columns",
          widgetIds: ["columns.timestamp", "columns.person"],
        },
        {
          id: "optional_columns",
          widgetIds: ["columns.event_name", "columns.session"],
        },
        { id: "pages", widgetIds: ["columns.url_path"] },
      ]);
    });

    it("shows pageviews and path cleaning once there's a URL path", () => {
      const { sections } = setup({
        eventSettings: { "columns.url_path": "path" },
      });

      expect(sections.at(-1)).toEqual({
        id: "pages",
        widgetIds: ["columns.url_path", "pageviews", "path_cleaning"],
      });
    });

    it("puts every setting in a section", () => {
      const { sections } = setup({
        eventSettings: { "columns.url_path": "path" },
      });

      expect(sections.flatMap(({ widgetIds }) => widgetIds).sort()).toEqual(
        Object.keys(EVENT_TABLE_SETTINGS).sort(),
      );
    });
  });

  describe("path cleaning", () => {
    it("has no rules without a URL path", () => {
      expect(setup().settings.path_cleaning).toEqual([]);
    });

    it("defaults to the generic rules with a URL path", () => {
      const { settings } = setup({
        eventSettings: { "columns.url_path": "path" },
      });

      expect(settings.path_cleaning).toEqual(getDefaultPathCleaningRules());
    });

    it("keeps an empty list of rules", () => {
      const { settings } = setup({
        eventSettings: { "columns.url_path": "path", path_cleaning: [] },
      });

      expect(settings.path_cleaning).toEqual([]);
    });

    it("falls back to the default rules when a stored rule is invalid", () => {
      const { settings } = setup({
        eventSettings: {
          "columns.url_path": "path",
          path_cleaning: [{ pattern: "", replacement: "" }],
        },
      });

      expect(settings.path_cleaning).toEqual(getDefaultPathCleaningRules());
    });
  });

  describe("pageviews", () => {
    it("defaults to the detected rule", () => {
      const { settings } = setup({ table: PAGES_TABLE });

      expect(settings.pageviews).toEqual(PAGEVIEW_RULE);
    });

    it("defaults to none without a detected rule", () => {
      const { settings } = setup({
        eventSettings: { "columns.url_path": "path" },
      });

      expect(settings.pageviews).toBeNull();
    });

    it("has none without a URL path", () => {
      const { settings } = setup({
        table: PAGES_TABLE,
        eventSettings: { "columns.url_path": null },
      });

      expect(settings.pageviews).toBeNull();
    });

    it("makes every event a pageview without an event name", () => {
      const { settings } = setup({
        table: PAGES_TABLE,
        eventSettings: { "columns.event_name": null },
      });

      expect(settings.pageviews).toEqual(EVERY_EVENT);
    });

    it("rejects a rule whose value doesn't fit its column", () => {
      const { settings } = setup({
        table: PAGES_TABLE,
        eventSettings: {
          pageviews: { type: "column_value", column: "event_type", value: "1" },
        },
      });

      expect(settings.pageviews).toEqual(PAGEVIEW_RULE);
    });

    it("keeps a rule on a numeric column with a semantic type", () => {
      const table = createMockTable({
        ...PAGES_TABLE,
        fields: PAGES_TABLE.fields?.map((field) =>
          field.name === "event_type"
            ? { ...field, semantic_type: "type/FK" }
            : field,
        ),
      });

      expect(setup({ table }).settings.pageviews).toEqual(PAGEVIEW_RULE);
    });
  });

  describe("isEventTableSetUp", () => {
    const EVENT_TABLE = createMockTable({
      ...TABLE,
      entity_type: "entity/EventTable",
    });

    it("is set up with an event time and a person", () => {
      expect(isEventTableSetUp(EVENT_TABLE)).toBe(true);
    });

    it("isn't set up without a person", () => {
      expect(
        isEventTableSetUp({
          ...EVENT_TABLE,
          event_settings: { "columns.person": null },
        }),
      ).toBe(false);
    });

    it("isn't set up unless it's an event table", () => {
      expect(
        isEventTableSetUp({
          ...EVENT_TABLE,
          entity_type: "entity/GenericTable",
        }),
      ).toBe(false);
    });

    it("trusts the roles' columns when the table's fields aren't loaded", () => {
      expect(isEventTableSetUp({ ...EVENT_TABLE, fields: undefined })).toBe(
        true,
      );
    });
  });
});
