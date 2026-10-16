import fetchMock from "fetch-mock";

import type { CollectionItem, SearchResult } from "metabase-types/api";
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

/**
 * Answers searches scoped to the Library from `setupLibraryEndpoints`, with the
 * results of the requested models. Set it up before `setupSearchEndpoints`,
 * which answers every other search.
 */
export function setupLibrarySearchEndpoint(searchResults: SearchResult[]) {
  fetchMock.get({
    url: "path:/api/search",
    query: { collection: 6464 },
    response: (call) => {
      const models = new URL(call.url).searchParams.getAll("models");
      const data = searchResults.filter((result) =>
        models.includes(result.model),
      );
      return { data, total: data.length, models };
    },
  });
}

export function setupCreateLibraryEndpoint(
  collection = createMockCollection(),
) {
  fetchMock.post("path:/api/ee/library", collection);
}

export function setupCreateLibraryEndpointError() {
  fetchMock.post("path:/api/ee/library", { status: 500 });
}
