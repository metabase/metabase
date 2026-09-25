import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { Palette } from "./Palette";

const setup = ({
  initialRoute,
  searchResults = [],
  searchResultsDelay,
}: {
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
    <Route path={initialRoute ? "*" : "/"} element={<Palette />} />,
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

  it("should not render on a path that disables the command palette", async () => {
    setup({ initialRoute: "/setup" });

    await userEvent.keyboard("[ControlLeft>]k");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("should not call recents API when palette is disabled", async () => {
    setup({ initialRoute: "/setup" });

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

    // wait for the call to be recorded: reading at(-1) too early re-reads the
    // previous request, whose body is already consumed
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(await calls().at(-1)?.request?.json()).toEqual({ value: "dark" });

    await userEvent.click(await screen.findByText("Toggle dark/light mode"));

    await waitFor(() => expect(calls()).toHaveLength(2));
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
  describe("Jev reranking", () => {
    const revenue = createMockSearchResult({
      model: "metric",
      id: 9,
      name: "Revenue",
    });
    const perQuarter = createMockSearchResult({
      model: "card",
      id: 15,
      name: "Revenue per quarter",
    });
    const byState = createMockSearchResult({
      model: "card",
      id: 2,
      name: "Revenue by state",
    });
    const QUERY = "revenue last quarter";

    const getResultNames = () =>
      screen
        .getAllByRole("option")
        .map((option) => option.textContent ?? "")
        .filter((text) => text.startsWith("Revenue"));

    it("reorders keyword results and pins Jev's best match", async () => {
      fetchMock.post("path:/api/jev/search/rerank", {
        status: "ok",
        elapsed_ms: 190,
        usage: null,
        ranked: [
          { model: "card", id: 15, score: 2.96 },
          { model: "metric", id: 9, score: 2.0 },
          { model: "card", id: 2, score: 1.5 },
        ],
        best: { model: "card", id: 15, confidence: 0.93 },
      });
      setup({ searchResults: [revenue, byState, perQuarter] });

      await userEvent.keyboard("[ControlLeft>]k");
      const input = await screen.findByPlaceholderText(/search for anything/i);
      await userEvent.type(input, QUERY);

      expect(await screen.findByText("Best match")).toBeInTheDocument();
      expect(screen.getByText("Jev · 190ms")).toBeInTheDocument();
      await waitFor(() =>
        expect(getResultNames()[0]).toMatch(/^Revenue per quarter/),
      );
    });

    it("leaves keyword results untouched when Jev is unavailable", async () => {
      fetchMock.post("path:/api/jev/search/rerank", 500);
      setup({ searchResults: [revenue, byState, perQuarter] });

      await userEvent.keyboard("[ControlLeft>]k");
      const input = await screen.findByPlaceholderText(/search for anything/i);
      await userEvent.type(input, QUERY);

      await waitFor(() =>
        expect(
          fetchMock.callHistory.called("path:/api/jev/search/rerank"),
        ).toBe(true),
      );
      // the mocked keyword search matches the whole query, which finds nothing here
      expect(
        await screen.findByText(`No results for “${QUERY}”`),
      ).toBeInTheDocument();
      expect(screen.queryByText("Best match")).not.toBeInTheDocument();
      expect(getResultNames()).toEqual([]);
    });
  });
});
