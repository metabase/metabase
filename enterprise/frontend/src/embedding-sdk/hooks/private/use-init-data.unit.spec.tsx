import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useInitData } from "embedding-sdk/hooks";
import { SDK_REDUCERS, useSdkSelector } from "embedding-sdk/store";
import { getIsLoggedIn, getLoginStatus } from "embedding-sdk/store/selectors";
import type { LoginStatusError } from "embedding-sdk/store/types";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import type { SDKConfigType } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

const TestComponent = ({
  authType,
  ...opts
}: {
  authType: SDKConfigType["authType"] | "invalid";
  opts?: Partial<SDKConfigType>;
}) => {
  const config = createMockConfig({ authType } as Partial<SDKConfigType>);

  const loginStatus = useSdkSelector(getLoginStatus);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useInitData({
    config: {
      ...config,
      metabaseInstanceUrl: "http://localhost",
      ...opts,
    } as SDKConfigType,
  });

  return (
    <div
      data-testid="test-component"
      data-is-logged-in={isLoggedIn}
      data-login-status={loginStatus.status}
      data-error-message={(loginStatus as LoginStatusError).error?.message}
    >
      Test Component
    </div>
  );
};

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

const setup = ({
  authType,
  isValidAuthentication = true,
  ...configOpts
}: Partial<Omit<SDKConfigType, "authType">> & {
  authType: SDKConfigType["authType"] | "invalid";
  isValidAuthentication?: boolean;
}) => {
  fetchMock.get("http://TEST_URI/sso/metabase", {
    id: "TEST_JWT_TOKEN",
    exp: 1965805007,
    iat: 1965805007,
  });

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

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser: TEST_USER,
  });

  setupEnterprisePlugins();
  setupApiKeyEndpoints([]);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  renderWithProviders(<TestComponent authType={authType} {...configOpts} />, {
    storeInitialState: state,
    customReducers: SDK_REDUCERS,
  });
};

describe("useInitData hook", () => {
  describe("before authentication", () => {
    it("should have an error if the authType is incorrect", async () => {
      setup({ authType: "invalid" });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );
    });

    it("should have an error if an API key is not provided", async () => {
      setup({ authType: "apiKey", apiKey: undefined });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );
    });

    it("should have an error if JWT URI is not provided", async () => {
      setup({ authType: "jwt", jwtProviderUri: undefined });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );
    });
  });

  describe("API Key authentication", () => {
    it("start loading data if API key and auth type are valid", async () => {
      setup({ authType: "apiKey" });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "loading",
      );
    });

    it("should set isLoggedIn to true if login is successful", async () => {
      setup({ authType: "apiKey" });
      expect(await screen.findByText("Test Component")).toBeInTheDocument();

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-is-logged-in",
        "true",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "success",
      );
    });

    it("should provide an error if login is unsuccessful", async () => {
      setup({ authType: "apiKey", isValidAuthentication: false });

      expect(await screen.findByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-error-message",
        "Could not authenticate: invalid API key",
      );
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
    it("start loading data if JWT URI and auth type are valid", async () => {
      setup({ authType: "jwt" });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "loading",
      );
    });

    it("should set isLoggedIn to true if login is successful", async () => {
      setup({ authType: "jwt" });

      expect(await screen.findByText("Test Component")).toBeInTheDocument();

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-is-logged-in",
        "true",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "success",
      );
    });

    it("should provide an error if login is unsuccessful", async () => {
      setup({ authType: "jwt", isValidAuthentication: false });

      expect(await screen.findByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-error-message",
        "Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token",
      );
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
});
