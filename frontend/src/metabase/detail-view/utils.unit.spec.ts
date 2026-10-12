import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getTableQuery } from "./utils";

describe("getTableQuery", () => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });
  const table = createOrdersTable();

  // The memoisation is what keeps `useSelector` from handing the page a new
  // query on every store action.
  it("keeps one query reference per metadata", () => {
    const query = getTableQuery(state, table);
    // Guards the assertion below: two `undefined`s would also compare equal.
    expect(query).toBeDefined();
    expect(getTableQuery(state, table)).toBe(query);
  });

  it("returns nothing without a table", () => {
    expect(getTableQuery(state, undefined)).toBeUndefined();
  });
});
