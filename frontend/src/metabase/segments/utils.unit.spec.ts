import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getSegmentQuery } from "./utils";

describe("getSegmentQuery", () => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });
  const definition = createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID },
  });

  // The memoisation is what keeps `useSelector` from handing the component a
  // new query on every store action.
  it("keeps one query reference per metadata", () => {
    const query = getSegmentQuery(state, definition, ORDERS_ID);
    // Guards the assertion below: two `undefined`s would also compare equal.
    expect(query).toBeDefined();
    expect(getSegmentQuery(state, definition, ORDERS_ID)).toBe(query);
  });

  it("returns nothing when the definition has no database", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      getSegmentQuery(state, { ...definition, database: null }, ORDERS_ID),
    ).toBeUndefined();
  });
});
