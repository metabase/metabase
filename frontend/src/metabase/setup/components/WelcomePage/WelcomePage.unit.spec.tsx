import React from "react";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { act, renderWithProviders, screen } from "__support__/ui";
import { WelcomePage } from "./WelcomePage";

const setup = () => {
  const state = createMockState({
    settings: createMockSettingsState({
      "available-locales": [["en", "English"]],
    }),
  });

  renderWithProviders(<WelcomePage />, { storeInitialState: state });
};

describe("WelcomePage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render after the locale is loaded", () => {
    setup();
    expect(screen.queryByText("Welcome to Metabase")).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(400));
    expect(screen.getByText("Welcome to Metabase")).toBeInTheDocument();
  });
});
