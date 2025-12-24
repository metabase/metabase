import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupAuditInfoEndpoint,
  setupCardEndpoints,
  setupCardsUsingModelEndpoint,
  setupRevisionsEndpoints,
  setupTokenStatusEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getQuestion } from "metabase/query_builder/selectors";
import type { Card, Settings, User } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { QuestionInfoSidebar } from "../QuestionInfoSidebar";

export interface SetupOpts {
  card?: Card;
  settings?: Settings;
  user?: Partial<User>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = async ({
  card = createMockCard(),
  settings = createMockSettings(),
  user,
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const currentUser = createMockUser(user);
  setupCardEndpoints(card);
  setupCardsUsingModelEndpoint(card);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);
  setupAuditInfoEndpoint();

  const state = createMockState({
    currentUser,
    settings: mockSettings(settings),
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const question = checkNotNull(getQuestion(state));
  const onSave = jest.fn();

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  setupTokenStatusEndpoint({ valid: enterprisePlugins.length > 0 });

  const TestQuestionInfoSidebar = () => (
    <QuestionInfoSidebar question={question} onSave={onSave} />
  );

  renderWithProviders(<Route path="*" component={TestQuestionInfoSidebar} />, {
    withRouter: true,
    storeInitialState: state,
  });

  await waitForLoaderToBeRemoved();
};
