import {
  createMockDataApp,
  createMockCollection,
} from "metabase-types/api/mocks";

import type { Collection } from "metabase-types/api";

import Collections from "../collections";
import DataApps from "./data-apps";

function getCollectionUpdateAction({
  collection,
  error,
}: {
  collection: Collection;
  error?: string;
}) {
  return {
    type: Collections.actionTypes.UPDATE,
    payload: {
      collection,
      object: collection,
      entities: {
        [collection.id]: collection,
      },
    },
    error,
  };
}

describe("entities > data apps > reducer", () => {
  describe("archiving", () => {
    const collection = createMockCollection({ id: 5 });
    const dataApp = createMockDataApp({ id: 1, collection });
    const state = { [dataApp.id]: dataApp };

    it("should remove data app when underlying collection is archived", () => {
      const anotherDataApp = createMockDataApp({ id: 2 });

      const nextState = DataApps.reducer(
        { ...state, [anotherDataApp.id]: anotherDataApp },
        getCollectionUpdateAction({
          collection: { ...collection, archived: true },
        }),
      );

      expect(nextState).toEqual({ [anotherDataApp.id]: anotherDataApp });
    });

    it("should ignore failed update actions", () => {
      const nextState = DataApps.reducer(
        state,
        getCollectionUpdateAction({
          collection: { ...collection, archived: true },
          error: "Something went wrong",
        }),
      );

      expect(nextState).toEqual(state);
    });
  });
});
