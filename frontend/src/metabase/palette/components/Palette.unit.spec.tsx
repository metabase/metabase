import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { Palette } from "./Palette";

const setup = ({
  routeProps,
  initialRoute,
  searchResults = [],
  searchResultsDelay,
}: {
  routeProps?: { disableCommandPalette?: boolean };
  initialRoute?: string;
  searchResults?: SearchResult[];
  searchResultsDelay?: number;
} = {}) => {
  setupDatabasesEndpoints([]);
  setupSearchEndpoints(searchResults, searchResultsDelay);
  setupRecentViewsEndpoints([]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", can_write: true })],
  });
  renderWithProviders(
    <Route
      path={initialRoute ? "*" : "/"}
      component={Palette}
      props={routeProps}
    />,
    {
      withKBar: true,
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({
          permissions: { can_create_queries: true },
        }),
      }),
    },
  );
};

describe("command palette", () => {
  it("should render the palette with the keyboard shortcut", async () => {
    setup();

    await userEvent.keyboard("[ControlLeft>]k");

    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
  });

  it("should not render if the route has disabled the command palette", async () => {
    setup({ routeProps: { disableCommandPalette: true } });

    await userEvent.keyboard("[ControlLeft>]k");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("should not call recents API when palette is disabled", async () => {
    setup({ routeProps: { disableCommandPalette: true } });

    await userEvent.keyboard("[ControlLeft>]k");

    expect(fetchMock.callHistory.called(/\/api\/activity\/recents/)).toBe(
      false,
    );
  });

  it("should toggle dark mode", async () => {
    fetchMock.put("path:/api/setting/color-scheme", 200);

    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);
    await userEvent.type(input, "dark mode");
    await userEvent.click(await screen.findByText("Toggle dark/light mode"));

    const calls = () =>
      fetchMock.callHistory.calls(/\/api\/setting\/color-scheme/);

    expect(await calls().at(-1)?.request?.json()).toEqual({ value: "dark" });

    await userEvent.click(await screen.findByText("Toggle dark/light mode"));

    expect(await calls().at(-1)?.request?.json()).toEqual({
      value: "auto",
    });
  });

  it("should match the action with alias when typing original name", async () => {
    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);

    // Original shortcut name is "Create a question" but when registering action
    // we rename it to "New question"
    await userEvent.type(input, "create q");

    expect(await screen.findByText("New question")).toBeInTheDocument();
  });

  it("should match actions via verb-swap aliases", async () => {
    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);

    await userEvent.type(input, "add dashboard");

    expect(await screen.findByText("New dashboard")).toBeInTheDocument();
  });

  it("should tolerate small typos in the search query", async () => {
    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);

    await userEvent.type(input, "creat q");

    expect(await screen.findByText("New question")).toBeInTheDocument();
  });

  it("should preserve user navigation selection when search results load", async () => {
    const getSelectedOption = () =>
      screen
        .getAllByRole("option")
        .find((option) => option.getAttribute("aria-selected") === "true");

    setup({
      searchResults: [createMockSearchResult({ name: "Metric search result" })],
      searchResultsDelay: 50, // add a delay to endpoint so that loading state can be triggered consistently w/o test flakes
    });

    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);
    await userEvent.type(input, "metric");

    await screen.findByText("Loading...");
    expect(getSelectedOption()?.textContent).toBe("Browse metrics");

    await userEvent.keyboard("{ArrowDown}");
    expect(getSelectedOption()?.textContent).toBe("New metric");

    await screen.findByText("Metric search result");
    expect(getSelectedOption()?.textContent).toBe("New metric");
  });

  it("should rank the most relevant action first", async () => {
    const getSelectedOption = () =>
      screen
        .getAllByRole("option")
        .find((option) => option.getAttribute("aria-selected") === "true");

    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);

    // Every "New …" action matches "New" equally, so the default order wins and
    // "New question" comes first.
    await userEvent.type(input, "New");
    await waitFor(() =>
      expect(getSelectedOption()?.textContent).toBe("New question"),
    );

    // "New c" is a stronger match for "New collection", which should now win
    // over the default order (metabase#76055).
    await userEvent.type(input, " c");
    await waitFor(() =>
      expect(getSelectedOption()?.textContent).toBe("New collection"),
    );
  });

  it("should initialize the search input from the search URL query (#71248)", async () => {
    setup({
      initialRoute: "/search?q=products",
      searchResults: [createMockSearchResult({ name: "Products" })],
    });

    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search for anything/i)).toHaveValue(
        "products",
      );
    });
    expect(await screen.findByText("Products")).toBeInTheDocument();
  });
});
