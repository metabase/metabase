import React from "react";
import { act, renderWithProviders, screen } from "__support__/ui";
import { WelcomePage } from "./WelcomePage";

const setup = () => {
  renderWithProviders(<WelcomePage />);
};

describe("WelcomePage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should not render until the locale is loaded", () => {
    setup();

    expect(screen.queryByText("Welcome to Metabase")).not.toBeInTheDocument();
  });

  it("should render after some time even if the locale is not loaded", () => {
    setup();

    act(() => jest.advanceTimersByTime(310));

    expect(screen.getByText("Welcome to Metabase")).toBeInTheDocument();
  });

  it("should render before the timeout if the locale is loaded", () => {
    setup();

    expect(screen.getByText("Welcome to Metabase")).toBeInTheDocument();
  });
});
