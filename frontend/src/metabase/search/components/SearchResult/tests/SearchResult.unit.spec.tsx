import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { SearchResult } from "metabase/search/components/SearchResult/SearchResult";
import { createWrappedSearchResult } from "metabase/search/components/SearchResult/tests/util";
import type { WrappedResult } from "metabase/search/types";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

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

const TEST_RESULT_INDEXED_ENTITY = createWrappedSearchResult({
  model: "indexed-entity",
  model_index_id: 1,
});

const USER = createMockUser();

const setup = ({ result }: { result: WrappedResult }) => {
  setupCollectionByIdEndpoint({
    collections: [TEST_REGULAR_COLLECTION],
  });

  setupUsersEndpoints([USER]);
  setupUserRecipientsEndpoint({ users: [USER] });

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => <SearchResult result={result} index={0} />}
    />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );

  return { history };
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

  it("should redirect to search result page when clicking item", async () => {
    const { history } = setup({ result: TEST_RESULT_QUESTION });

    await userEvent.click(screen.getByText(TEST_RESULT_QUESTION.name));

    const expectedPath = TEST_RESULT_QUESTION.getUrl();

    expect(history?.getCurrentLocation().pathname).toEqual(expectedPath);
  });

  describe("indexed entities", () => {
    it("renders x-ray button for indexed entity search result", () => {
      setup({ result: TEST_RESULT_INDEXED_ENTITY });

      expect(screen.getByTestId("search-result-item-icon")).toHaveAttribute(
        "type",
        "indexed-entity",
      );

      expect(getIcon("bolt")).toBeInTheDocument();
    });

    it("redirects to x-ray page when clicking on x-ray button", async () => {
      const { history } = setup({ result: TEST_RESULT_INDEXED_ENTITY });

      expect(getIcon("bolt")).toBeInTheDocument();

      await userEvent.click(getIcon("bolt"));

      const expectedPath = `/auto/dashboard/model_index/${TEST_RESULT_INDEXED_ENTITY.model_index_id}/primary_key/${TEST_RESULT_INDEXED_ENTITY.id}`;

      expect(history?.getCurrentLocation().pathname).toEqual(expectedPath);
    });
  });
});
