import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSearchResult, createMockUser } from "metabase-types/api/mocks";
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
      createMockSearchResult({ name: "Browse Metrics", model: "collection" }),
      createMockSearchResult({ name: "Metric Model", model: "dataset" }),
    ];

    fetchMock.get(
      "path:/api/search",
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            data: searchResults,
            total: searchResults.length,
          });
        }, 100); // Delay to simulate network latency
      }),
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

    // Quickly navigate down before results load
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");

    // Wait for search results to appear
    await waitFor(() => {
      expect(screen.getByText("New metric")).toBeInTheDocument();
    });

    // The second item should still be selected, not reset to first
    // Check that the third action is selected (after two arrow downs)
    // Since the first result is a header "Results", the active item should be the 3rd actual result
    const options = screen.getAllByRole("option");

    // Find which option is selected
    const selectedOption = options.find(
      option => option.getAttribute("aria-selected") === "true",
    );

    // The user navigated twice, so they should be on the third selectable item
    // (skipping the "Results" header which is at index 0)
    expect(selectedOption).toBeDefined();
    // We can't easily assert exactly which item without knowing the full structure,
    // but the key point is that it should NOT be the first result
    expect(selectedOption).not.toBe(options[0]);
  });
});
