import fetchMock from "fetch-mock";

import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

export const setupLibraryEndpoints = (hasLibrary?: boolean) => {
  if (hasLibrary) {
    fetchMock.get(
      "path:/api/ee/library",
      createMockCollectionItem({
        id: 6464,
        name: "Library",
        type: "library",
        model: "collection",
        location: "/",
        here: ["collection"],
        below: ["dataset", "metric"],
      }),
    );
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
