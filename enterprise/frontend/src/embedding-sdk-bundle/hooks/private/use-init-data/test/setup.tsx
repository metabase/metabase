/* eslint-disable i18next/no-literal-string */

import { renderWithProviders } from "__support__/ui";
import {
  sdkReducers,
  useSdkDispatch,
  useSdkSelector,
} from "embedding-sdk-bundle/store";
import { refreshTokenAsync } from "embedding-sdk-bundle/store/auth";
import {
  getIsLoggedIn,
  getLoginStatus,
} from "embedding-sdk-bundle/store/selectors";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  MOCK_INSTANCE_URL,
  setupSamlPopup,
} from "embedding-sdk-bundle/test/mocks/sso";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type {
  LoginStatusError,
  MetabaseAuthConfig,
} from "embedding-sdk-bundle/types";

import { useInitData } from "../use-init-data";

jest.mock("embedding/auth-common/saml-token-storage", () => {
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

export type MetabaseConfigProps = Partial<MetabaseAuthConfig>;

export const TestComponent = ({ config }: { config: MetabaseConfigProps }) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useInitData({
    authConfig: createMockSdkConfig({
      ...config,
      metabaseInstanceUrl: config.metabaseInstanceUrl ?? MOCK_INSTANCE_URL,
    }),
  });

  const refreshToken = () =>
    dispatch(
      refreshTokenAsync({
        metabaseInstanceUrl: MOCK_INSTANCE_URL,
        preferredAuthMethod: config.preferredAuthMethod,
      }),
    );

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
  const popupMock = setupSamlPopup();

  const { state } = setupSdkState({
    sdkState: createMockSdkState({
      loginStatus: createMockLoginStatusState({ status: "uninitialized" }),
    }),
  });
  const view = renderWithProviders(<TestComponent config={config} />, {
    storeInitialState: state,
    customReducers: sdkReducers,
  });

  return {
    ...view,
    popupMock,
  };
};
