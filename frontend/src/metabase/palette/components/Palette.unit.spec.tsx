import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Palette } from "./Palette";

const setup = ({
  routeProps,
}: { routeProps?: { disableCommandPalette?: boolean } } = {}) => {
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  renderWithProviders(<Route path="/" component={Palette} {...routeProps} />, {
    withKBar: true,
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser(),
    }),
  });
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

    expect(
      await fetchMock.callHistory
        .lastCall(/\/api\/setting\/color-scheme/)
        ?.request?.json(),
    ).toEqual({ value: "dark" });

    await userEvent.click(await screen.findByText("Toggle dark/light mode"));

    expect(
      await fetchMock.callHistory
        .lastCall(/\/api\/setting\/color-scheme/)
        ?.request?.json(),
    ).toEqual({ value: "auto" });
  });

  it("should preserve user navigation selection when search results load", async () => {
    setupDatabasesEndpoints([]);
    setupRecentViewsEndpoints([]);

    // Set up a delayed search response to simulate slow API
    const searchResults = [
      createMockSearchResult({ name: "New metric", model: "card" }),
      createMockSearchResult({ name: "Browse metrics", model: "collection" }),
      createMockSearchResult({ name: "Metric Model", model: "dataset" }),
    ];

    fetchMock.get(
      "path:/api/search",
      {
        data: searchResults,
        total: searchResults.length,
      },
      { delay: 100 },
    );

    renderWithProviders(<Route path="/" component={Palette} />, {
      withKBar: true,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser(),
      }),
    });

    // Open command palette
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);

    // Type search query
    await userEvent.type(input, "metric");

    // Wait for initial actions to appear (New metric, Browse metrics from basic actions)
    await waitFor(() => {
      expect(screen.getByText("New metric")).toBeInTheDocument();
    });

    // Navigate down to select the second action (Browse metrics)
    await userEvent.keyboard("{ArrowDown}");

    // Wait a bit more for the delayed search results to load
    await waitFor(
      () => {
        // Search results should now be loaded (will include "Results" header)
        expect(screen.getByText("Results")).toBeInTheDocument();
      },
      { timeout: 200 },
    );

    // Verify that the user's selection is preserved
    const options = screen.getAllByRole("option");
    const selectedOption = options.find(
      option => option.getAttribute("aria-selected") === "true",
    );

    expect(selectedOption).toBeDefined();
    // The selection should still be on "Browse metrics", not reset to first item
    expect(selectedOption).toHaveTextContent("Browse metrics");
  });
});
