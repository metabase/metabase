import type { EventTableSettings, Field } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { getColumnRoleValue, isEventTableSetUp } from "./event-tables";

const CREATED_AT = createMockField({
  id: 1,
  name: "created_at",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
});
const USER_ID = createMockField({
  id: 2,
  name: "user_id",
  base_type: "type/Text",
  effective_type: "type/Text",
});
const PROPERTIES_USER_ID = createMockField({
  id: 3,
  name: "properties_user_id",
  base_type: "type/Text",
  effective_type: "type/Text",
  parent_id: 4,
});

type CreateTableOpts = {
  entityType?: string;
  fields?: Field[];
  eventSettings?: EventTableSettings | null;
};

const createTable = ({
  entityType = "entity/EventTable",
  fields = [CREATED_AT, USER_ID, PROPERTIES_USER_ID],
  eventSettings = null,
}: CreateTableOpts = {}) =>
  createMockTable({
    entity_type: entityType,
    fields,
    event_settings: eventSettings,
  });

describe("getColumnRoleValue", () => {
  it("returns the column a user set", () => {
    const table = createTable({
      eventSettings: { "columns.person": "user_id" },
    });
    expect(getColumnRoleValue(table, "person")).toBe("user_id");
  });

  it("returns null when no column is set", () => {
    expect(getColumnRoleValue(createTable(), "person")).toBeNull();
  });

  it("returns null when the column is no longer in the table", () => {
    const table = createTable({
      eventSettings: { "columns.person": "dropped_column" },
    });
    expect(getColumnRoleValue(table, "person")).toBeNull();
  });

  it("returns null for a timestamp column that isn't a date", () => {
    const table = createTable({
      eventSettings: { "columns.timestamp": "user_id" },
    });
    expect(getColumnRoleValue(table, "timestamp")).toBeNull();
  });

  it("returns null for a nested column", () => {
    const table = createTable({
      eventSettings: { "columns.person": "properties_user_id" },
    });
    expect(getColumnRoleValue(table, "person")).toBeNull();
  });
});

describe("isEventTableSetUp", () => {
  const SET_UP_SETTINGS: EventTableSettings = {
    "columns.timestamp": "created_at",
    "columns.person": "user_id",
  };

  it("is set up when an event table has every required column", () => {
    expect(
      isEventTableSetUp(createTable({ eventSettings: SET_UP_SETTINGS })),
    ).toBe(true);
  });

  it("isn't set up without the Event entity type", () => {
    const table = createTable({
      entityType: "entity/GenericTable",
      eventSettings: SET_UP_SETTINGS,
    });
    expect(isEventTableSetUp(table)).toBe(false);
  });

  it("isn't set up while a required column is missing", () => {
    const table = createTable({
      eventSettings: { "columns.timestamp": "created_at" },
    });
    expect(isEventTableSetUp(table)).toBe(false);
  });

  it("isn't set up when a required column was dropped", () => {
    const table = createTable({
      fields: [CREATED_AT],
      eventSettings: SET_UP_SETTINGS,
    });
    expect(isEventTableSetUp(table)).toBe(false);
  });

  describe("without the table's fields", () => {
    const createTableWithoutFields = (eventSettings: EventTableSettings) =>
      createMockTable({
        entity_type: "entity/EventTable",
        event_settings: eventSettings,
      });

    it("is set up when every required column is set", () => {
      expect(isEventTableSetUp(createTableWithoutFields(SET_UP_SETTINGS))).toBe(
        true,
      );
    });

    it("isn't set up while a required column is missing", () => {
      const table = createTableWithoutFields({
        "columns.timestamp": "created_at",
        "columns.person": null,
      });
      expect(isEventTableSetUp(table)).toBe(false);
    });
  });
});
