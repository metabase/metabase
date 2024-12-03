import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import * as sdkConfigModule from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import {
  sdkReducers,
  useSdkDispatch,
  useSdkSelector,
} from "embedding-sdk/store";
import { refreshTokenAsync } from "embedding-sdk/store/auth";
import { getIsLoggedIn, getLoginStatus } from "embedding-sdk/store/selectors";
import type { LoginStatusError } from "embedding-sdk/store/types";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import type {
  MetabaseAuthConfig,
  MetabaseAuthConfigWithProvider,
} from "embedding-sdk/types";
import { GET } from "metabase/lib/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

const TestComponent = ({ authConfig }: { authConfig: MetabaseAuthConfig }) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useInitData({
    authConfig: {
      ...authConfig,
      metabaseInstanceUrl: "http://localhost",
    } as MetabaseAuthConfig,
  });

  const refreshToken = () =>
    dispatch(refreshTokenAsync("http://TEST_URI/sso/metabase"));

  const handleClick = () => {
    GET("/api/some/url")();
  };

  return (
    <div
      data-testid="test-component"
      data-is-logged-in={isLoggedIn}
      data-login-status={loginStatus.status}
      data-error-message={(loginStatus as LoginStatusError).error?.message}
    >
      Test Component
      <button onClick={refreshToken}>Refresh Token</button>
      <button onClick={handleClick}>Send test request</button>
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
} & Partial<MetabaseAuthConfigWithProvider>) => {
  fetchMock.get("http://TEST_URI/sso/metabase", {
    id: "TEST_JWT_TOKEN",
    exp: 1965805007,
    iat: 1965805007,
  });

  fetchMock.get("path:/api/some/url", {});

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

  const authConfig = createMockAuthProviderUriConfig({
    authProviderUri: isValidConfig ? "http://TEST_URI/sso/metabase" : "",
    ...configOpts,
  });

  return renderWithProviders(<TestComponent authConfig={authConfig} />, {
    storeInitialState: state,
    customReducers: sdkReducers,
  });
};

describe("useInitData hook", () => {
  describe("before authentication", () => {
    it("should set a context for all API requests", async () => {
      jest
        .spyOn(sdkConfigModule, "getEmbeddingSdkVersion")
        .mockImplementationOnce(() => "1.2.3");

      setup({});

      await userEvent.click(screen.getByText("Send test request"));

      await waitFor(() => {
        expect(fetchMock.called("path:/api/some/url")).toBeTruthy();
      });

      const lastCallRequest = fetchMock.lastCall("path:/api/some/url")?.request;

      expect(lastCallRequest?.headers.get("X-Metabase-Client")).toEqual(
        "embedding-sdk-react",
      );
      expect(lastCallRequest?.headers.get("X-Metabase-Client-Version")).toEqual(
        "1.2.3",
      );
    });
  });

  describe("authProviderUri authentication", () => {
    it("start loading data if authProviderUri and auth type are valid", async () => {
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
        "Failed to fetch the user, the session might be invalid.",
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

    it("should use a custom fetchRefreshToken function when specified", async () => {
      let fetchRequestToken = jest.fn(async () => ({
        id: "foo",
        exp: Number.MAX_SAFE_INTEGER,
      }));

      const { rerender } = setup({ isValidConfig: true, fetchRequestToken });

      expect(await screen.findByText("Test Component")).toBeInTheDocument();
      expect(fetchRequestToken).toHaveBeenCalledTimes(1);

      // Pass in a new fetchRequestToken function
      // We expect the new function to be called when the "Refresh Token" button is clicked
      fetchRequestToken = jest.fn(async () => ({
        id: "bar",
        exp: Number.MAX_SAFE_INTEGER,
      }));

      const authConfig = createMockAuthProviderUriConfig({
        authProviderUri: "http://TEST_URI/sso/metabase",
        fetchRequestToken,
      });

      rerender(<TestComponent authConfig={authConfig} />);

      await userEvent.click(screen.getByText("Refresh Token"));

      expect(fetchRequestToken).toHaveBeenCalledTimes(1);
    });
  });
});
