import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useInitData } from "embedding-sdk/hooks";
import { sdkReducers, useSdkSelector } from "embedding-sdk/store";
import { getIsLoggedIn, getLoginStatus } from "embedding-sdk/store/selectors";
import type { LoginStatusError } from "embedding-sdk/store/types";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import type { SDKConfig } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

const TestComponent = ({ config }: { config: SDKConfig }) => {
  const loginStatus = useSdkSelector(getLoginStatus);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useInitData({
    config: {
      ...config,
      metabaseInstanceUrl: "http://localhost",
    } as SDKConfig,
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
  isValidConfig = true,
  isValidUser = true,
  ...configOpts
}: {
  isValidConfig?: boolean;
  isValidUser?: boolean;
} & Partial<SDKConfig>) => {
  fetchMock.get("http://TEST_URI/sso/metabase", {
    id: "TEST_JWT_TOKEN",
    exp: 1965805007,
    iat: 1965805007,
  });

  setupCurrentUserEndpoint(
    TEST_USER,
    isValidUser
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
    sdk: createMockSdkState({
      // loginStatus.status is set to "success" by default for SDK component tests.
      // here we're testing the hook's ability to change the states, so we'll start with
      // the default state of "uninitialized"
      loginStatus: createMockLoginStatusState({ status: "uninitialized" }),
    }),
  });

  setupEnterprisePlugins();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  const config = createMockConfig({
    jwtProviderUri: isValidConfig ? "http://TEST_URI/sso/metabase" : "",
  });

  renderWithProviders(<TestComponent config={config} {...configOpts} />, {
    storeInitialState: state,
    customReducers: sdkReducers,
  });
};

describe("useInitData hook", () => {
  describe("before authentication", () => {
    it("should have an error if JWT URI is not provided", async () => {
      setup({ isValidConfig: false });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "error",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-error-message",
        "Invalid JWT URI provided.",
      );
    });
  });

  describe("JWT authentication", () => {
    it("start loading data if JWT URI and auth type are valid", async () => {
      setup({ isValidConfig: true });
      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "loading",
      );
    });

    it("should set isLoggedIn to true if login is successful", async () => {
      setup({ isValidConfig: true });

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
      setup({ isValidConfig: true, isValidUser: false });

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
      setup({ isValidConfig: true });
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
