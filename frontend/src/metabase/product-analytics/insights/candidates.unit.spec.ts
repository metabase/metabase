import type { Field } from "metabase-types/api";
import {
  createMockField,
  createMockFingerprint,
  createMockTable,
} from "metabase-types/api/mocks";

import { getInsightAttributes } from "./candidates";

const ROLES = {
  timestamp: "created_at",
  person: "person_id",
  session: null,
  event_id: "event_id",
  event_name: "event_name",
  url_path: null,
};

const createStringField = (
  id: number,
  name: string,
  distinctCount: number,
): Field =>
  createMockField({
    id,
    name,
    display_name: name,
    base_type: "type/Text",
    fingerprint: createMockFingerprint({
      global: { "distinct-count": distinctCount, "nil%": 0 },
    }),
  });

const TABLE = createMockTable({
  fields: [
    createStringField(1, "person_id", 5000),
    createStringField(2, "browser", 6),
    createStringField(3, "os", 4),
    createStringField(4, "city", 900),
  ],
});

type SetupOpts = {
  focusColumn?: string;
};

const setup = ({ focusColumn }: SetupOpts = {}) =>
  getInsightAttributes({
    context: { table: TABLE, usersTable: undefined },
    roles: ROLES,
    stepColumns: new Set(),
    focusColumn,
  }).map(({ column }) => column);

describe("getInsightAttributes", () => {
  it("takes low-cardinality columns that aren't roles", () => {
    expect(setup()).toEqual(["os", "browser"]);
  });

  it("puts the focus column first", () => {
    expect(setup({ focusColumn: "browser" })).toEqual(["browser", "os"]);
  });

  it("takes the focus column whatever its number of values", () => {
    expect(setup({ focusColumn: "city" })).toEqual(["city", "os", "browser"]);
  });

  it("still leaves out a focus column that's a role", () => {
    expect(setup({ focusColumn: "person_id" })).toEqual(["os", "browser"]);
  });
});
