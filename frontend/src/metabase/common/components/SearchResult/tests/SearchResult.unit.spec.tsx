import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  fireEvent,
  getIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { SearchResult } from "metabase/common/components/SearchResult/SearchResult";
import { createWrappedSearchResult } from "metabase/common/components/SearchResult/tests/util";
import { trackSearchClick } from "metabase/common/search/analytics";
import { modelToUrl } from "metabase/urls";
import type { SearchResult as ApiSearchResult } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

jest.mock("metabase/common/search/analytics", () => ({
  ...jest.requireActual("metabase/common/search/analytics"),
  trackSearchClick: jest.fn(),
}));

const TEST_REGULAR_COLLECTION = createMockCollection({
  id: 1,
  name: "Regular Collection",
  authority_level: null,
});

const TEST_RESULT_QUESTION = createWrappedSearchResult({
  name: "My Item",
  model: "card",
  description: "My Item Description",
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

const setup = ({ result }: { result: ApiSearchResult }) => {
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
    expect(getIcon("table2")).toBeInTheDocument();
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

    const expectedPath = modelToUrl(TEST_RESULT_QUESTION);

    expect(history?.getCurrentLocation().pathname).toEqual(expectedPath);
  });

  it("renders the result as a link and lets the browser open a modified click in a new tab", () => {
    const { history } = setup({ result: TEST_RESULT_QUESTION });

    const title = screen.getByTestId("search-result-item-name");
    expect(title).toHaveAttribute("href", modelToUrl(TEST_RESULT_QUESTION));

    fireEvent.click(title, { metaKey: true });

    // a ⌘/ctrl-click must not navigate in-app; the browser opens the new tab
    // via the href instead
    expect(history?.getCurrentLocation().pathname).toBe("/");
  });

  it("tracks a search click when a result is opened via a ⌘/ctrl-click", () => {
    const trackSearchClickMock = jest.mocked(trackSearchClick);
    trackSearchClickMock.mockClear();

    setup({ result: TEST_RESULT_QUESTION });
    fireEvent.click(screen.getByTestId("search-result-item-name"), {
      metaKey: true,
    });

    expect(trackSearchClickMock).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "item", position: 0 }),
    );
  });

  it("tracks a search click when a result is opened via a middle-click", () => {
    const trackSearchClickMock = jest.mocked(trackSearchClick);
    trackSearchClickMock.mockClear();

    setup({ result: TEST_RESULT_QUESTION });
    fireEvent(
      screen.getByTestId("search-result-item-name"),
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(trackSearchClickMock).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "item", position: 0 }),
    );
  });

  it("does not track a result open when a child control is middle-clicked", () => {
    const trackSearchClickMock = jest.mocked(trackSearchClick);
    trackSearchClickMock.mockClear();

    setup({ result: TEST_RESULT_INDEXED_ENTITY });
    // middle-clicking the x-ray button opens nothing for the result itself, so
    // the bubbled auxclick must not record a result-open
    fireEvent(
      getIcon("bolt"),
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(trackSearchClickMock).not.toHaveBeenCalled();
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
