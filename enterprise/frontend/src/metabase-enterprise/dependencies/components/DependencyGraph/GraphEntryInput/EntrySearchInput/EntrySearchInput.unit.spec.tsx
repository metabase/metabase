import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDataAppsEndpoint,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { DataApp, DependencyEntry } from "metabase-types/api";
import {
  createMockDataApp,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { type EntrySearchModel, SEARCH_MODELS } from "../constants";

import { EntrySearchInput } from "./EntrySearchInput";

const BIRD_APP = createMockDataApp({
  id: 7,
  name: "sightings",
  display_name: "Bird sightings",
});

const OWL_APP = createMockDataApp({
  id: 8,
  name: "parliament",
  display_name: "Owls",
});

const BIRD_CARD = createMockSearchResult({
  id: 3,
  name: "Bird counts",
  model: "card",
});

type SetupOpts = {
  searchModels?: EntrySearchModel[];
  dataApps?: DataApp[];
  hasDataApps?: boolean;
};

function setup({
  searchModels = SEARCH_MODELS,
  dataApps = [BIRD_APP, OWL_APP],
  hasDataApps = true,
}: SetupOpts = {}) {
  setupRecentViewsEndpoints([]);
  setupSearchEndpoints([BIRD_CARD]);
  setupListDataAppsEndpoint(dataApps);
  const onEntryChange = jest.fn<void, [DependencyEntry]>();

  const renderInput = (searchModels: EntrySearchModel[]) => (
    <EntrySearchInput
      searchModels={searchModels}
      isGraphFetching={false}
      onEntryChange={onEntryChange}
      onSearchModelsChange={jest.fn<void, [EntrySearchModel[]]>()}
      onPickerOpen={jest.fn<void, []>()}
    />
  );

  const { rerender } = renderWithProviders(renderInput(searchModels), {
    storeInitialState: createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          "data-apps": hasDataApps,
        }),
      }),
    }),
  });

  return {
    onEntryChange,
    setSearchModels: (searchModels: EntrySearchModel[]) =>
      rerender(renderInput(searchModels)),
  };
}

async function search(text: string) {
  await userEvent.type(
    screen.getByPlaceholderText("Pick an item to see its dependencies"),
    text,
  );
}

describe("EntrySearchInput", () => {
  it("finds the data apps whose display name matches, after the search results", async () => {
    const { onEntryChange } = setup();

    await search("bird");

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

  it("finds a data app by its slug", async () => {
    setup();

    await search("parliament");

    expect(
      await screen.findByRole("option", { name: /Owls/ }),
    ).toBeInTheDocument();
  });

  it("doesn't search the index when data apps are the only kind picked", async () => {
    setup({ searchModels: ["data-app"] });

    await search("bird");

    expect(
      await screen.findByRole("option", { name: /Bird sightings/ }),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/search")).toBe(false);
  });

  it("drops the search results once data apps are the only kind picked", async () => {
    const { setSearchModels } = setup();

    await search("bird");
    expect(
      await screen.findByRole("option", { name: /Bird counts/ }),
    ).toBeInTheDocument();

    setSearchModels(["data-app"]);

    expect(
      screen.queryByRole("option", { name: /Bird counts/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Bird sightings/ }),
    ).toBeInTheDocument();
  });

  it("doesn't list data apps when they aren't picked", async () => {
    setup({ searchModels: ["card"] });

    await search("bird");

    expect(
      await screen.findByRole("option", { name: /Bird counts/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Bird sightings/ }),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/apps")).toBe(false);
  });

  it("doesn't list data apps without the data apps feature", async () => {
    setup({ hasDataApps: false });

    await search("bird");

    expect(
      await screen.findByRole("option", { name: /Bird counts/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Bird sightings/ }),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/apps")).toBe(false);
  });

  it("offers a data apps filter when the user has data apps", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("checkbox", { name: "Data apps" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Questions" })).toBeChecked();
  });

  it("offers no data apps filter when the user has no data apps", async () => {
    setup({ dataApps: [] });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("checkbox", { name: "Questions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Data apps" }),
    ).not.toBeInTheDocument();
  });
});
