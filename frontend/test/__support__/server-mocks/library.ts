import fetchMock from "fetch-mock";

import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

interface SetupLibraryEndpointsOpts {
  hasLibrary?: boolean;
  library?: Partial<CollectionItem>;
}

export const setupLibraryEndpoints = ({
  hasLibrary = false,
  library,
}: SetupLibraryEndpointsOpts = {}) => {
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
        ...library,
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
