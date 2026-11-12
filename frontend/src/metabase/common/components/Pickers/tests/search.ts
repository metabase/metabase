import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { checkNotNull } from "metabase/utils/types";
import type { Collection, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

export const ROOT = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: true,
});

export const FIRST_COLLECTION_ID = 9;
export const FIRST_COLLECTION = createMockCollection({
  id: FIRST_COLLECTION_ID,
  name: "First collection",
  location: "/",
  can_write: true,
});

export const NORMAL_USER = createMockUser({
  id: 2,
  first_name: "Robert",
  last_name: "Tableton",
  personal_collection_id: 7,
  is_superuser: false,
});

export const ADMIN_USER = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  personal_collection_id: 5,
  is_superuser: true,
});

export const NORMAL_PERSONAL_COLLECTION = createMockCollection({
  id: 7,
  name: "Robert Tableton's Personal Collection",
  personal_owner_id: NORMAL_USER.id,
  is_personal: true,
  location: "/",
  can_write: true,
});

export const ADMIN_PERSONAL_COLLECTION = createMockCollection({
  id: 5,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: ADMIN_USER.id,
  is_personal: true,
  location: "/",
  can_write: true,
});

const CARD_SEARCH_MODELS = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const;

/**
 * Search results for a question, a model and a metric with the suffixes 1 and
 * 2 in each collection, named like `${namePrefix} question 1`.
 */
export const createCardSearchResults = (
  collections: { collection: Collection; namePrefix: string }[],
): SearchResult[] =>
  collections.flatMap(({ collection, namePrefix }, collectionIndex) =>
    Object.entries(CARD_SEARCH_MODELS).flatMap(([type, model], typeIndex) =>
      ["1", "2"].map((suffix) =>
        createMockSearchResult({
          id: 1000 + collectionIndex * 100 + typeIndex * 10 + Number(suffix),
          name: `${namePrefix} ${type} ${suffix}`,
          model,
          collection,
        }),
      ),
    ),
  );

/** The collection items of `collection` among `searchResults`. */
export const getCollectionItems = (
  searchResults: SearchResult[],
  collection: Collection,
) =>
  searchResults
    .filter((result) => result.collection.id === collection.id)
    .map((result) =>
      createMockCollectionItem({
        id: result.id,
        name: result.name,
        model: result.model,
        collection_id: typeof collection.id === "number" ? collection.id : null,
      }),
    );

export const getSearchScopeSelector = () =>
  within(screen.getByTestId("search-scope-selector"));

export const getScopeRadio = (name: string | RegExp) =>
  getSearchScopeSelector().getByRole("radio", { name });

export const getLastSearchParams = () => {
  const call = fetchMock.callHistory.lastCall("path:/api/search");
  return new URL(checkNotNull(call?.request?.url)).searchParams;
};

/** Replaces the text in the picker search input and waits for the search. */
export const typeSearchText = async (text: string) => {
  const input = await screen.findByPlaceholderText("Search…");
  await userEvent.clear(input);
  await userEvent.type(input, text);
  await screen.findByText(`Search results for "${text}"`);
};

const getSearchResultsList = () =>
  within(screen.getByTestId("item-picker-level-1"));

export const getSearchResult = (name: string) =>
  getSearchResultsList().getByText(name);

/** Waits until the search results are exactly `names`, in this order. */
export const expectSearchResults = async (names: string[]) => {
  await waitFor(() => {
    const texts = getSearchResultsList()
      .getAllByTestId("result-item")
      .map((item) => within(item).getByRole("link").textContent ?? "");
    expect(texts).toHaveLength(names.length);
    names.forEach((name, index) => expect(texts[index]).toContain(name));
  });
};
