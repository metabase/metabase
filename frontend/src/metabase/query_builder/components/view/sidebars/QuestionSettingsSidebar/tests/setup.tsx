import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCardEndpoints } from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Settings } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionSettingsSidebar } from "../QuestionSettingsSidebar";

export interface SetupOpts {
  card?: Card;
  settings?: Settings;
  hasEnterprisePlugins?: boolean;
}

export const setup = async ({
  card = createMockCard(),
  settings = createMockSettings(),
  hasEnterprisePlugins,
}: SetupOpts) => {
  const currentUser = createMockUser();
  setupCardEndpoints(card);
  setupPerformanceEndpoints([]);

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

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
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
