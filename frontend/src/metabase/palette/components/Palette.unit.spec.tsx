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
    setup();
    await userEvent.keyboard("[ControlLeft>]k");
    await screen.findByTestId("command-palette");
    const input = await screen.findByPlaceholderText(/search for anything/i);
    await userEvent.type(input, "dark mode");
    await userEvent.click(await screen.findByText("Toggle dark/light mode"));

    const getColorSchemeValue = () =>
      window.localStorage.getItem("metabase-color-scheme");

    expect(getColorSchemeValue()).toBe("dark");
    await userEvent.click(await screen.findByText("Toggle dark/light mode"));
    expect(getColorSchemeValue()).toBe("auto");
  });
});
