import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getTableQuery } from "./utils";

describe("getTableQuery", () => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });
  const table = state.entities.tables[ORDERS_ID];

  // The memoisation is what keeps `useSelector` from handing the page a new
  // query on every store action.
  it("keeps one query reference per metadata", () => {
    expect(getTableQuery(state, table)).toBe(getTableQuery(state, table));
  });

  it("returns nothing without a table", () => {
    expect(getTableQuery(state, undefined)).toBeUndefined();
  });
});
