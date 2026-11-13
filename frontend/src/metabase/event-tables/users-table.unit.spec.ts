import type { Field } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { getUsersTableLink } from "./users-table";

const EVENTS_ID = 1;
const PEOPLE_ID = 2;

const createForeignKey = (
  name: string,
  target: { tableId: number; name: string },
): Field =>
  createMockField({
    table_id: EVENTS_ID,
    name,
    semantic_type: "type/FK",
    target: createMockField({ table_id: target.tableId, name: target.name }),
  });

const createEventTable = (fields: Field[]) =>
  createMockTable({
    id: EVENTS_ID,
    fields: [
      createMockField({ table_id: EVENTS_ID, name: "user_pseudo_id" }),
      ...fields,
    ],
  });

const USER_ID = createForeignKey("user_id", { tableId: PEOPLE_ID, name: "id" });

describe("getUsersTableLink", () => {
  it("links through the person column's foreign key", () => {
    expect(getUsersTableLink(createEventTable([USER_ID]), "user_id")).toEqual({
      tableId: PEOPLE_ID,
      foreignKey: "user_id",
      primaryKey: "id",
    });
  });

  it("doesn't link through a foreign key on another column", () => {
    expect(
      getUsersTableLink(createEventTable([USER_ID]), "user_pseudo_id"),
    ).toBeUndefined();
  });

  it("ignores a foreign key to the event table itself", () => {
    const parentId = createForeignKey("parent_id", {
      tableId: EVENTS_ID,
      name: "id",
    });
    expect(
      getUsersTableLink(createEventTable([parentId]), "parent_id"),
    ).toBeUndefined();
  });

  it("finds nothing without a person column or a table", () => {
    expect(getUsersTableLink(createEventTable([USER_ID]), null)).toBe(
      undefined,
    );
    expect(getUsersTableLink(undefined, "user_id")).toBeUndefined();
  });
});
