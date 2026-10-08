import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { getCollectionTimelines } from "./timelines";

const COLLECTION_ID = 7;
const COLLECTION_ENTITY_ID = createMockEntityId();

const releases = createMockTimeline({
  id: 1,
  collection_id: COLLECTION_ID,
  collection: createMockCollection({
    id: COLLECTION_ID,
    entity_id: COLLECTION_ENTITY_ID,
  }),
});
const incidents = createMockTimeline({ id: 2, collection_id: 99 });
const rootTimeline = createMockTimeline({ id: 3, collection_id: null });
const timelines = [releases, incidents, rootTimeline];

describe("getCollectionTimelines", () => {
  it("returns the timelines of the given collection", () => {
    expect(getCollectionTimelines(timelines, COLLECTION_ID)).toEqual([
      releases,
    ]);
  });

  it("returns the timelines addressed by a numeric collection id string", () => {
    expect(getCollectionTimelines(timelines, String(COLLECTION_ID))).toEqual([
      releases,
    ]);
  });

  it("returns the timelines addressed by collection entity id", () => {
    expect(getCollectionTimelines(timelines, COLLECTION_ENTITY_ID)).toEqual([
      releases,
    ]);
  });

  it.each([null, undefined, "root", "tenant"] as const)(
    "returns root timelines for collection %s",
    (collectionId) => {
      expect(getCollectionTimelines(timelines, collectionId)).toEqual([
        rootTimeline,
      ]);
    },
  );

  it("returns nothing for pseudo collections", () => {
    expect(getCollectionTimelines(timelines, "personal")).toEqual([]);
  });
});
