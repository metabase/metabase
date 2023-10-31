import {
  setupCollectionByIdEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { SearchResult } from "metabase/search/components/SearchResult/SearchResult";
import { createWrappedSearchResult } from "metabase/search/components/SearchResult/tests/util";
import type { WrappedResult } from "metabase/search/types";

const TEST_REGULAR_COLLECTION = createMockCollection({
  id: 1,
  name: "Regular Collection",
  authority_level: null,
});

const TEST_RESULT_QUESTION = createWrappedSearchResult({
  name: "My Item",
  model: "card",
  description: "My Item Description",
  getIcon: () => ({ name: "table" }),
});

const TEST_RESULT_COLLECTION = createWrappedSearchResult({
  name: "My Folder of Goodies",
  model: "collection",
  collection: TEST_REGULAR_COLLECTION,
});

const setup = ({ result }: { result: WrappedResult }) => {
  setupCollectionByIdEndpoint({
    collections: [TEST_REGULAR_COLLECTION],
  });

  setupUsersEndpoints([createMockUser()]);

  renderWithProviders(<SearchResult result={result} />);
};

describe("SearchResult", () => {
  it("renders a search result question item", () => {
    setup({ result: TEST_RESULT_QUESTION });

    expect(screen.getByText(TEST_RESULT_QUESTION.name)).toBeInTheDocument();
    expect(
      screen.getByText(TEST_RESULT_QUESTION.description as string),
    ).toBeInTheDocument();
    expect(getIcon("table")).toBeInTheDocument();
  });

  it("renders a search result collection item", () => {
    setup({ result: TEST_RESULT_COLLECTION });

    expect(screen.getByText(TEST_RESULT_COLLECTION.name)).toBeInTheDocument();
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(
      screen.queryByText(TEST_RESULT_COLLECTION.collection.name),
    ).not.toBeInTheDocument();
    expect(getIcon("folder")).toBeInTheDocument();
  });
});
