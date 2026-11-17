import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupDisconnectSlackEndpoint,
  setupMfaStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  renderRoutes,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { MfaStatus, TokenFeatures, User } from "metabase-types/api";
import {
  createMockMfaStatus,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import UserPasswordApp from "../UserPasswordApp";

let authPasswordUserPredicates: typeof PLUGIN_IS_PASSWORD_USER = [];

export type SetupOpts = {
  user?: User;
  currentUserResponse?: User;
  currentUserStatus?: number;
  disconnectResponse?: Parameters<typeof setupDisconnectSlackEndpoint>[1];
  routes?: Parameters<typeof renderRoutes>[0];
  mfaStatus?: MfaStatus;
  hasMfaPlugin?: boolean;
  hasAuthPlugin?: boolean;
  isPasswordLoginEnabled?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

export function setup({
  user = createMockUser(),
  currentUserResponse = { ...user, slack_account_status: null },
  currentUserStatus = 200,
  disconnectResponse,
  routes,
  mfaStatus = createMockMfaStatus(),
  hasMfaPlugin = false,
  hasAuthPlugin = false,
  isPasswordLoginEnabled = true,
  tokenFeatures = {},
}: SetupOpts = {}) {
  const passwordUserPredicates = PLUGIN_IS_PASSWORD_USER.filter(
    (predicate) => !authPasswordUserPredicates.includes(predicate),
  );
  PLUGIN_IS_PASSWORD_USER.splice(
    0,
    PLUGIN_IS_PASSWORD_USER.length,
    ...passwordUserPredicates,
  );
  authPasswordUserPredicates = [];
  if (currentUserStatus === 200) {
    setupCurrentUserEndpoint(currentUserResponse);
  } else {
    fetchMock.get("path:/api/user/current", { status: currentUserStatus });
  }
  setupMfaStatusEndpoint(mfaStatus);
  setupDisconnectSlackEndpoint(user.id, disconnectResponse);

  const state = createMockState({
    currentUser: user,
    settings: mockSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "mfa-enforcement": mfaStatus.mfa_enabled ? "optional" : "off",
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasMfaPlugin) {
    setupEnterpriseOnlyPlugin("multi_factor_auth");
  }
  if (hasAuthPlugin) {
    const predicateCount = PLUGIN_IS_PASSWORD_USER.length;
    setupEnterpriseOnlyPlugin("auth");
    authPasswordUserPredicates = PLUGIN_IS_PASSWORD_USER.slice(predicateCount);
  }

  const options = {
    withRouter: true,
    initialRoute: "/account/authentication",
    withUndos: true,
    storeInitialState: state,
  };
  const rendered = routes
    ? renderRoutes(routes, options)
    : renderWithProviders(<UserPasswordApp />, options);

  return {
    ...rendered,
    user,
    openDisconnectDialog,
    disconnect: async () =>
      userEvent.click(
        within(await openDisconnectDialog()).getByRole("button", {
          name: "Disconnect",
        }),
      ),
  };
}

async function openDisconnectDialog() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Disconnect" }),
  );
  return screen.findByRole("dialog", {
    name: "Disconnect your Slack account?",
  });
}
