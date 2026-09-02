import { createMockTimeline } from "metabase-types/api/mocks";

import { getCollectionTimelines } from "./timelines";

const COLLECTION_ID = 7;

const releases = createMockTimeline({ id: 1, collection_id: COLLECTION_ID });
const incidents = createMockTimeline({ id: 2, collection_id: 99 });
const rootTimeline = createMockTimeline({ id: 3, collection_id: null });
const timelines = [releases, incidents, rootTimeline];

describe("getCollectionTimelines", () => {
  it("returns the timelines of the given collection", () => {
    expect(getCollectionTimelines(timelines, COLLECTION_ID)).toEqual([
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
