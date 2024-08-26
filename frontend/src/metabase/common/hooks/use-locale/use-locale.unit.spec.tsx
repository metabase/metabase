import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { useLocale } from "./use-locale";

const TestComponent = () => {
  const locale = useLocale();
  return <div data-testid="locale">{`${locale}`}</div>;
};

describe("useLocale", () => {
  it("returns undefined if no locale is set", async () => {
    renderWithProviders(<TestComponent />, {
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": undefined }),
        currentUser: createMockUser({ locale: null }),
      }),
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("undefined");
  });

  it("returns the user's locale if the site locale is undefined", async () => {
    renderWithProviders(<TestComponent />, {
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": undefined }),
        currentUser: createMockUser({ locale: "zh" }),
      }),
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("zh");
  });

  it("returns the site locale if user locale is null", async () => {
    renderWithProviders(<TestComponent />, {
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": "zh" }),
        currentUser: createMockUser({ locale: null }),
      }),
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("zh");
  });

  it("returns the site locale if user locale is undefined", async () => {
    renderWithProviders(<TestComponent />, {
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": "zh" }),
        currentUser: createMockUser({ locale: undefined }),
      }),
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("zh");
  });

  it("returns the user locale if both locales are set", async () => {
    renderWithProviders(<TestComponent />, {
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": "zh" }),
        currentUser: createMockUser({ locale: "ar" }),
      }),
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("ar");
  });
});
