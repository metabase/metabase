import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { setupModelPersistenceEndpoints } from "__support__/server-mocks/persist";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Settings } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  getMockModelCacheInfo,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionSettingsSidebar } from "../QuestionSettingsSidebar";

export interface SetupOpts {
  card?: Card;
  settings?: Settings;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  dbHasModelPersistence?: boolean;
  dbSupportsModelPersistence?: boolean;
}

export const setup = async ({
  card = createMockCard(),
  settings = createMockSettings(),
  enterprisePlugins,
  dbHasModelPersistence = true,
  dbSupportsModelPersistence = true,
}: SetupOpts) => {
  const currentUser = createMockUser();
  setupCardEndpoints(card);
  setupPerformanceEndpoints([]);
  setupModelPersistenceEndpoints([
    getMockModelCacheInfo({
      card_id: card.id as number,
      state: "persisted",
    }),
  ]);

  setupDatabaseEndpoints(
    createSampleDatabase({
      settings: { "persist-models-enabled": dbHasModelPersistence },
      features: dbSupportsModelPersistence
        ? COMMON_DATABASE_FEATURES
        : COMMON_DATABASE_FEATURES.filter(
            (feature) => feature !== "persist-models",
          ),
    }),
  );

  const state = createMockState({
    currentUser,
    settings: mockSettings({
      ...settings,
      "token-features": createMockTokenFeatures(
        settings["token-features"] || {},
      ),
    }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const TestQuestionSettingsSidebar = () => (
    <QuestionSettingsSidebar question={question} />
  );

  renderWithProviders(
    <Route path="*" component={TestQuestionSettingsSidebar} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();
};
