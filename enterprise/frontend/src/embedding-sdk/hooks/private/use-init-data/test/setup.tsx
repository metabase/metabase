/* eslint-disable i18next/no-literal-string */
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import {
  sdkReducers,
  useSdkDispatch,
  useSdkSelector,
} from "embedding-sdk/store";
import { refreshTokenAsync } from "embedding-sdk/store/auth";
import { getIsLoggedIn, getLoginStatus } from "embedding-sdk/store/selectors";
import { createMockSdkConfig } from "embedding-sdk/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import type { LoginStatusError, MetabaseAuthConfig } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useInitData } from "../use-init-data";

export const TEST_JWT_PROVIDER_URI = "http://test_uri/sso/metabase";
export const TEST_INSTANCE_URL = "http://localhost";
export const TEST_USER = createMockUser();

jest.mock("embedding-sdk/store/auth/saml-token-storage", () => {
  let token: any = null;
  return {
    samlTokenStorage: {
      set: (value: any) => {
        token = value;
      },
      get: () => token,
      remove: () => {
        token = null;
      },
    },
  };
});

export const setupMockAuthSsoEndpoints = (method: "saml" | "jwt" = "saml") => {
  if (method === "saml") {
    fetchMock.get(`${TEST_INSTANCE_URL}/auth/sso`, {
      url: TEST_JWT_PROVIDER_URI,
      method: "saml",
    });

    fetchMock.post(`${TEST_INSTANCE_URL}/auth/sso`, {
      body: {
        id: "TEST_SESSION_TOKEN",
        exp: 1965805007,
        iat: 1965805007,
      },
    });
  } else {
    fetchMock.get(`${TEST_INSTANCE_URL}/auth/sso`, {
      url: TEST_JWT_PROVIDER_URI,
      method: "jwt",
    });

    fetchMock.get(TEST_JWT_PROVIDER_URI, {
      jwt: "TEST_JWT_TOKEN",
    });

    fetchMock.get(`${TEST_INSTANCE_URL}/auth/sso?jwt=TEST_JWT_TOKEN`, {
      body: {
        id: "TEST_SESSION_TOKEN",
        exp: 1965805007,
        iat: 1965805007,
      },
    });
  }

  fetchMock.get("http://oisin-is-really-cool/auth/sso", {
    status: 500,
    body: { error: "Fake unreachable server" },
  });
};

export const setupSamlPopup = () => {
  const popupMock = {
    closed: false,
    close: jest.fn(),
  };

  jest
    .spyOn(window, "open")
    .mockImplementation(() => popupMock as unknown as Window);

  // Wait until the next tick to simulate popup message
  process.nextTick(() => {
    const authData = {
      id: "TEST_SESSION_TOKEN",
      exp: 1965805007,
      iat: 1965805007,
      status: "ok",
    };

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "SAML_AUTH_COMPLETE",
          authData,
        },
      }),
    );
  });

  return popupMock;
};

export type MetabaseConfigProps = Partial<MetabaseAuthConfig>;

export const TestComponent = ({ config }: { config: MetabaseConfigProps }) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useInitData({
    authConfig: createMockSdkConfig({
      ...config,
      metabaseInstanceUrl: config.metabaseInstanceUrl ?? TEST_INSTANCE_URL,
    }),
  });

  const refreshToken = () => dispatch(refreshTokenAsync(TEST_INSTANCE_URL));

  return (
    <div
      data-testid="test-component"
      data-is-logged-in={isLoggedIn}
      data-login-status={loginStatus.status}
      data-error-message={(loginStatus as LoginStatusError).error?.message}
    >
      Test Component
      <button onClick={refreshToken}>Refresh Token</button>
    </div>
  );
};

export const setup = (config: MetabaseConfigProps = {}) => {
  setupCurrentUserEndpoint(TEST_USER);

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
      loginStatus: createMockLoginStatusState({ status: "uninitialized" }),
    }),
  });

  setupEnterprisePlugins();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  const popupMock = setupSamlPopup();

  const view = renderWithProviders(<TestComponent config={config} />, {
    storeInitialState: state,
    customReducers: sdkReducers,
  });

  return {
    ...view,
    popupMock,
  };
};
