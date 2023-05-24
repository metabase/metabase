/* istanbul ignore file */
import React from "react";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import type { Card, DatasetQuery, WritebackAction } from "metabase-types/api";
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
  model?: Card | null;
};

export async function setup({
  action,
  canWrite = true,
  hasActionsEnabled = true,
  isAdmin = false,
  isPublicSharingEnabled = false,
  model,
}: SetupOpts = {}) {
  if (model === undefined) {
    model = createMockCard({
      dataset: true,
      can_write: canWrite,
    });
  }

  const database = createMockDatabase({
    settings: { "database-enable-actions": hasActionsEnabled },
  });

  setupDatabasesEndpoints([database]);
  setupCardsEndpoints([model].filter(Boolean) as Card<DatasetQuery>[]);

  if (action) {
    fetchMock.get(`path:/api/action/${action.id}`, action);
    fetchMock.delete(`path:/api/action/${action.id}/public_link`, 204);
    fetchMock.post(`path:/api/action/${action.id}/public_link`, {
      uuid: "mock-uuid",
    });
  }

  renderWithProviders(
    <ActionCreator
      actionId={action?.id}
      modelId={model?.id}
      databaseId={database.id}
    />,
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
