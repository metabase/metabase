/* eslint-disable i18next/no-literal-string */

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
  MOCK_INSTANCE_URL,
  setupSamlPopup,
} from "embedding-sdk/test/mocks/sso";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import type { LoginStatusError, MetabaseAuthConfig } from "embedding-sdk/types";

import { useInitData } from "../use-init-data";

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
        authMethod: config.authMethod,
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
