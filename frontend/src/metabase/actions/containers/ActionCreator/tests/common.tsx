/* istanbul ignore file */
import React from "react";
import nock from "nock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import type { WritebackAction } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import ActionCreator from "../ActionCreator";

export const SITE_URL = "http://localhost:3000";

export type SetupOpts = {
  action?: WritebackAction;
  canWrite?: boolean;
  hasActionsEnabled?: boolean;
  isAdmin?: boolean;
  isPublicSharingEnabled?: boolean;
};

export async function setup({
  action,
  canWrite = true,
  hasActionsEnabled = true,
  isAdmin = false,
  isPublicSharingEnabled = false,
}: SetupOpts = {}) {
  const scope = nock(location.origin);
  const model = createMockCard({
    dataset: true,
    can_write: canWrite,
  });
  const database = createMockDatabase({
    settings: { "database-enable-actions": hasActionsEnabled },
  });

  setupDatabasesEndpoints(scope, [database]);
  setupCardsEndpoints(scope, [model]);

  if (action) {
    scope.get(`/api/action/${action.id}`).reply(200, action);
    scope.delete(`/api/action/${action.id}/public_link`).reply(204);
    scope
      .post(`/api/action/${action.id}/public_link`)
      .reply(200, { uuid: "mock-uuid" });
  }

  renderWithProviders(
    <ActionCreator actionId={action?.id} modelId={model.id} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          is_superuser: isAdmin,
        }),
        settings: createMockSettingsState({
          "enable-public-sharing": isPublicSharingEnabled,
          "site-url": SITE_URL,
        }),
      }),
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );
}
