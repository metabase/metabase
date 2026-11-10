import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getInitialQuery, getQuery } from "./utils";

describe("NewMetricPage query selectors", () => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });
  const datasetQuery = Lib.toLegacyQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  );

  // Each call builds a fresh Question, so without memoisation these would
  // hand `useSelector` a new query on every store action.
  it("keeps one query reference per metadata", () => {
    expect(getInitialQuery(state)).toBe(getInitialQuery(state));
    expect(getQuery(state, datasetQuery)).toBe(getQuery(state, datasetQuery));
  });
});
