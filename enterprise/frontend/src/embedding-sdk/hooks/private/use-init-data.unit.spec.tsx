import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { useInitData } from "embedding-sdk/hooks";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import type { SDKConfigType } from "embedding-sdk/types";
import { Loader } from "metabase/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

const TestComponent = ({
  authType,
}: {
  authType: SDKConfigType["authType"] | "invalid";
}) => {
  const config = createMockConfig({ authType } as Partial<SDKConfigType>);

  const { isLoggedIn, loginStatus } = useInitData({
    config: {
      ...config,
      metabaseInstanceUrl: "http://localhost",
    } as SDKConfigType,
  });

  if (loginStatus?.status === "loading") {
    return <Loader data-testid="loading-spinner" />;
  }

  if (loginStatus?.status === "error") {
    return <div>{loginStatus.error.message}</div>;
  }

  return (
    <div data-testid="test-component" data-is-logged-in={isLoggedIn}>
      Test Component
    </div>
  );
};

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

const setup = ({
  authType,
  isValidAuthentication = true,
}: {
  authType: SDKConfigType["authType"] | "invalid";
  isValidAuthentication?: boolean;
}) => {
  // Mock JWT SSO Endpoint
  fetchMock.mock("http://TEST_URI/sso/metabase", {
    id: "TEST_JWT_TOKEN",
    exp: 1965805007,
    iat: 1965805007,
  });

  const currentUser = TEST_USER;

  setupCurrentUserEndpoint(
    TEST_USER,
    isValidAuthentication
      ? undefined
      : {
          response: 500,
        },
  );

  const settingValues = createMockSettings();
  const tokenFeatures = createMockTokenFeatures();
  const settings = [
    createMockSettingDefinition({
      key: "token-features",
      value: tokenFeatures,
    }),
  ];

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
    embeddingSessionToken: {
      token: null,
      loading: false,
      error: null,
    },
  });

  setupEnterprisePlugins();
  setupApiKeyEndpoints([]);
  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValuesWithToken);

  renderWithProviders(<TestComponent authType={authType} />, {
    storeInitialState: state,
    mode: "sdk",
  });
};

describe("useInitData hook", () => {
  describe("API Key authentication", () => {
    // it("should set isInitialized once the API key is set", async () => {
    //   setup({ authType: "apiKey" });
    //   expect(await screen.findByText("Test Component")).toBeInTheDocument();
    //   expect(screen.getByTestId("test-component")).toHaveAttribute(
    //     "data-is-initialized",
    //     "true",
    //   );
    // });

    it("should set isLoggedIn to true if login is successful", async () => {
      setup({ authType: "apiKey" });
      expect(await screen.findByText("Test Component")).toBeInTheDocument();

      // expect(screen.getByTestId("test-component")).toHaveAttribute(
      //   "data-is-initialized",
      //   "true",
      // );
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-is-logged-in",
        "true",
      );
    });

    it("should provide an error if login is unsuccessful", async () => {
      setup({ authType: "apiKey", isValidAuthentication: false });
      expect(
        await screen.findByText("Couldn't fetch current user: Invalid API key"),
      ).toBeInTheDocument();
    });

    it("should send API requests with an API key if initialization and login are successful", async () => {
      setup({ authType: "apiKey" });
      expect(await screen.findByText("Test Component")).toBeInTheDocument();

      const lastCallRequest = fetchMock.lastCall(
        "path:/api/user/current",
      )?.request;

      expect(lastCallRequest?.headers.get("X-Api-Key")).toEqual("TEST_API_KEY");
    });
  });

  describe("JWT authentication", () => {
    // it("should set isInitialized once the JWT is set", async () => {
    //   setup({ authType: "jwt" });
    //   await waitForLoaderToBeRemoved();
    //
    //   expect(await screen.findByText("Test Component")).toBeInTheDocument();
    //   expect(screen.getByTestId("test-component")).toHaveAttribute(
    //     "data-is-initialized",
    //     "true",
    //   );
    // });

    it("should set isLoggedIn to true if login is successful", async () => {
      setup({ authType: "jwt" });
      await waitForLoaderToBeRemoved();

      expect(await screen.findByText("Test Component")).toBeInTheDocument();
      // expect(screen.getByTestId("test-component")).toHaveAttribute(
      //   "data-is-initialized",
      //   "true",
      // );
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-is-logged-in",
        "true",
      );
    });

    it("should provide an error if login is unsuccessful", async () => {
      setup({ authType: "jwt", isValidAuthentication: false });
      expect(
        await screen.findByText(
          "Couldn't fetch current user: JWT token is invalid",
        ),
      ).toBeInTheDocument();
    });

    it("should send API requests with JWT token if initialization and login are successful", async () => {
      setup({ authType: "jwt" });
      expect(await screen.findByText("Test Component")).toBeInTheDocument();

      const lastCallRequest = fetchMock.lastCall(
        "path:/api/user/current",
      )?.request;

      expect(lastCallRequest?.headers.get("X-Metabase-Session")).toEqual(
        "TEST_JWT_TOKEN",
      );
    });
  });

  describe("Invalid authentication", () => {
    it("should provide an error if auth type is not valid", () => {
      setup({ authType: "invalid" });
      expect(screen.getByText("Invalid auth type")).toBeInTheDocument();
    });
  });
});
