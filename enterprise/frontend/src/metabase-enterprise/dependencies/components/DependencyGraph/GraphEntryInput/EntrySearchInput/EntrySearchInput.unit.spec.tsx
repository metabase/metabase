import userEvent from "@testing-library/user-event";

import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyEntry, SearchResult } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";

import { SEARCH_MODELS } from "../constants";

import { EntrySearchInput } from "./EntrySearchInput";

const BIRD_CARD = createMockSearchResult({
  id: 3,
  name: "Bird counts",
  model: "card",
});

const BIRD_APP = createMockSearchResult({
  id: 7,
  name: "Bird sightings",
  model: "data-app",
});

type SetupOpts = {
  searchResults?: SearchResult[];
};

function setup({ searchResults = [BIRD_CARD, BIRD_APP] }: SetupOpts = {}) {
  setupRecentViewsEndpoints([]);
  setupSearchEndpoints(searchResults);
  const onEntryChange = jest.fn<void, [DependencyEntry]>();

  renderWithProviders(
    <EntrySearchInput
      searchModels={SEARCH_MODELS}
      isGraphFetching={false}
      onEntryChange={onEntryChange}
      onSearchModelsChange={jest.fn()}
      onPickerOpen={jest.fn<void, []>()}
    />,
  );

  return { onEntryChange };
}

describe("EntrySearchInput", () => {
  it("finds data apps in the search index, and picks one as the entry", async () => {
    const { onEntryChange } = setup();

    await userEvent.type(
      screen.getByPlaceholderText("Pick an item to see its dependencies"),
      "bird",
    );

    await screen.findByRole("option", { name: /Bird sightings/ });
    expect(
      screen.getAllByRole("option").map((option) => option.textContent?.trim()),
    ).toEqual(["Bird counts", "Bird sightings", "Browse all"]);

    await userEvent.click(
      screen.getByRole("option", { name: /Bird sightings/ }),
    );
    expect(onEntryChange).toHaveBeenCalledTimes(1);
    expect(onEntryChange).toHaveBeenCalledWith({ id: 7, type: "data-app" });
  });

  it("offers a data apps filter when the search finds data apps", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("checkbox", { name: "Data apps" }),
    ).toBeInTheDocument();
  });

  it("offers no data apps filter when the search finds none", async () => {
    setup({ searchResults: [BIRD_CARD] });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("checkbox", { name: "Questions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Data apps" }),
    ).not.toBeInTheDocument();
  });
});
