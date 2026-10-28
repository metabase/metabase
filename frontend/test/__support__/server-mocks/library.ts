import fetchMock from "fetch-mock";

import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

export const setupLibraryEndpoints = (
  hasLibrary?: boolean,
  library: CollectionItem = createMockCollectionItem({
    id: 6464,
    name: "Library",
    type: "library",
    model: "collection",
    location: "/",
    here: ["collection"],
    below: ["dataset", "metric"],
  }),
) => {
  if (hasLibrary) {
    fetchMock.get("path:/api/ee/library", library);
  } else {
    // yep, a 200 with a not found message
    fetchMock.get("path:/api/ee/library", {
      message: "not found",
    });
  }
};

export function setupCreateLibraryEndpoint(
  collection = createMockCollection(),
) {
  fetchMock.post("path:/api/ee/library", collection);
}

export function setupCreateLibraryEndpointError() {
  fetchMock.post("path:/api/ee/library", { status: 500 });
}
