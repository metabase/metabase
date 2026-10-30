import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import {
  EVENT_TABLE_SETTINGS,
  getEventTableSections,
  getEventTableSettings,
} from "./event-table-settings";
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

type SetupOpts = {
  eventSettings?: Table["event_settings"];
};

const setup = ({ eventSettings = {} }: SetupOpts = {}) => {
  const table = { ...TABLE, event_settings: eventSettings };
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
});
