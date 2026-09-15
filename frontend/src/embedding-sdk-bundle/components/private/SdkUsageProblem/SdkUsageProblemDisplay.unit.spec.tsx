import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, screen, waitFor, within } from "__support__/ui";
import { SdkUsageProblemDisplay } from "embedding-sdk-bundle/components/private/SdkUsageProblem";
import * as IsLocalhostModule from "embedding-sdk-bundle/lib/get-is-localhost";
import { getHostReactMajorVersion } from "embedding-sdk-bundle/lib/host-react-version";
import { initAuth } from "embedding-sdk-bundle/store/auth";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import {
  createMockApiKeyConfig,
  createMockSdkConfig,
} from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
  createMockTokenState,
} from "embedding-sdk-bundle/test/mocks/state";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const TEST_USER = createMockUser();

jest.mock("metabase/visualizations/register", () => ({
  registerVisualizations: jest.fn(),
}));

// Jest runs React 18 on localhost, which shows the React 18 warning banner.
// Each test sets the host React major version instead.
jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  getHostReactMajorVersion: jest.fn(),
}));

interface Options {
  authConfig: MetabaseAuthConfig;
  hasEmbeddingFeature?: boolean;
  isEmbeddingSdkEnabled?: boolean;
  isDevelopmentMode?: boolean;
  hasExpirationClaim?: boolean;
  hostReactMajorVersion?: number;
  initStatus?: LoginStatus["status"];
  children?: ReactElement;
}

const setup = ({
  hasExpirationClaim = true,
  hostReactMajorVersion = 19,
  initStatus = "success",
  children = <div>hello!</div>,
  ...options
}: Options) => {
  jest.mocked(getHostReactMajorVersion).mockReturnValue(hostReactMajorVersion);

  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: options.hasEmbeddingFeature ?? true,
    development_mode: options.isDevelopmentMode ?? false,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-embedding-modular": options.isEmbeddingSdkEnabled ?? true,
  });

  const MINUTE = 60;
  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: TEST_USER,
    sdk: createMockSdkState({
      initStatus: createMockLoginStatusState({ status: initStatus }),
      token: createMockTokenState({
        token: {
          id: "123",
          exp: hasExpirationClaim
            ? Math.round(Date.now() / 1000) + 10 * MINUTE
            : null,
        },
      }),
    }),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValues);

  return renderWithSDKProviders(children, {
    componentProviderProps: { authConfig: options.authConfig },
    storeInitialState: state,
  });
};

const PROBLEM_CARD_TEST_ID = "sdk-usage-problem-card";
const PROBLEM_INDICATOR_TEST_ID = "sdk-usage-problem-indicator";

describe("SdkUsageProblemDisplay", () => {
  it("does not show an error when JWT is provided with a license", () => {
    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: true,
    });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();
  });

  it("shows an error when JWT is used without a license", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
    expect(within(card).getByText("Error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /Attempting to use this in other ways is in breach of our usage policy/,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade",
    );
  });

  it("shows a warning when API keys are used in localhost", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({ authConfig: createMockApiKeyConfig(), hasEmbeddingFeature: true });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/authentication#2-add-a-new-endpoint-to-your-backend-to-handle-authentication",
    );
  });

  it("shows an error when API keys are used in production", async () => {
    const mock = jest
      .spyOn(IsLocalhostModule, "getIsLocalhost")
      .mockImplementation(() => false);

    setup({
      authConfig: createMockApiKeyConfig(),
      hasEmbeddingFeature: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
    expect(within(card).getByText("Error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    mock.mockRestore();
  });

  // We allow the SDK to be used locally even when embedding isn't enabled for
  // the instance: showing an error was confusing — clicking "hide" cleared it
  // and the SDK rendered anyway — so on localhost there is no usage problem.
  it("does not show an error when Embedding SDK is disabled on localhost", () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: true,
      isEmbeddingSdkEnabled: false,
    });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();
  });

  it("shows the API key warning when the SDK is disabled on localhost but an API key is used", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({
      authConfig: createMockApiKeyConfig(),
      hasEmbeddingFeature: true,
      isEmbeddingSdkEnabled: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    // API keys are always allowed on localhost regardless of the
    // `enable-embedding-modular` setting, so the eval-only warning still shows —
    // not the "not enabled" error.
    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    expect(
      within(card).queryByText(/Embedding is not enabled for this instance/),
    ).not.toBeInTheDocument();
  });

  it("shows an error when Embedding SDK is disabled in production", async () => {
    const mock = jest
      .spyOn(IsLocalhostModule, "getIsLocalhost")
      .mockImplementation(() => false);

    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: true,
      isEmbeddingSdkEnabled: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText(
        /Embedding is not enabled for this instance. Please enable it in settings./,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/introduction#in-metabase",
    );

    mock.mockRestore();
  });

  it("shows a warning when development mode is enabled", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        "This Metabase is in development mode intended exclusively for testing. Using this Metabase for everyday BI work or when embedding in production is considered unfair usage.",
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade",
    );
  });

  it('should show a warning when JWT token does not contain the "exp" claim', async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: false,
      hasExpirationClaim: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        `The JWT token is missing the "exp" (expiration) claim. We will disallow tokens without "exp" in a future release. Please add "exp" to the token payload.`,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/authentication#2-add-a-new-endpoint-to-your-backend-to-handle-authentication",
    );
  });

  it("shows a warning when the host app runs React 18 on localhost", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({ authConfig: createMockSdkConfig(), hostReactMajorVersion: 18 });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        "This application uses React 18. The Metabase modular embedding SDK will require React 19 in a future release, and this embed will stop working once your Metabase instance is upgraded to it. Please upgrade your application to React 19.",
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/introduction#modular-embedding-sdk-prerequisites",
    );
  });

  it("logs a usage problem to the console once the SDK has initialized", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const authConfig = createMockSdkConfig();

    // The SDK test renderer turns console logging off for its own display.
    const { store } = setup({
      authConfig,
      hostReactMajorVersion: 18,
      initStatus: "loading",
      children: (
        <SdkUsageProblemDisplay authConfig={authConfig} allowConsoleLog />
      ),
    });

    expect(
      await screen.findAllByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toHaveLength(0);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(initAuth.fulfilled(undefined, "test-request", authConfig));
    });

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
    expect(String(consoleWarnSpy.mock.calls[0][0])).toContain(
      "This application uses React 18. The Metabase modular embedding SDK will require React 19 in a future release, and this embed will stop working once your Metabase instance is upgraded to it. Please upgrade your application to React 19.",
    );

    consoleWarnSpy.mockRestore();
  });

  it("does not show the React 18 warning outside localhost", () => {
    const mock = jest
      .spyOn(IsLocalhostModule, "getIsLocalhost")
      .mockImplementation(() => false);

    setup({ authConfig: createMockSdkConfig(), hostReactMajorVersion: 18 });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();

    mock.mockRestore();
  });

  it("does not show the React 18 warning when the host app runs React 19", () => {
    setup({ authConfig: createMockSdkConfig(), hostReactMajorVersion: 19 });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();
  });

  it("shows the API key warning over the React 18 warning on localhost", async () => {
    setup({ authConfig: createMockApiKeyConfig(), hostReactMajorVersion: 18 });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    expect(
      within(card).queryByText(/This application uses React 18/),
    ).not.toBeInTheDocument();
  });

  it("hides the problem when 'hide' is clicked", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    await userEvent.click(within(card).getByText("Hide warning"));

    await waitFor(() => {
      expect(
        screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
      ).not.toBeInTheDocument();
    });
  });
});
