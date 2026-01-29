import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { SearchResult } from "metabase-types/api";
import {
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Palette } from "./Palette";

const setup = ({
  routeProps,
  searchResults = [],
}: {
  routeProps?: { disableCommandPalette?: boolean };
  searchResults?: SearchResult[];
} = {}) => {
  setupDatabasesEndpoints([]);
  setupSearchEndpoints(searchResults);
  setupRecentViewsEndpoints([]);
  renderWithProviders(<Route path="/" component={Palette} {...routeProps} />, {
    withKBar: true,
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({
        permissions: { can_create_queries: true },
      }),
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
    const getSelectedOption = () =>
      screen
        .getAllByRole("option")
        .find((option) => option.getAttribute("aria-selected") === "true");

    setup({
      searchResults: [createMockSearchResult({ name: "Metric search result" })],
    });

    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);
    await userEvent.type(input, "metric");

    await screen.findByText("Loading...");
    expect(getSelectedOption()?.textContent).toBe("New metric");

    await userEvent.keyboard("{ArrowDown}");
    expect(getSelectedOption()?.textContent).toBe("Browse metrics");

    await screen.findByText("Metric search result");
    expect(getSelectedOption()?.textContent).toBe("Browse metrics");
  });
});
