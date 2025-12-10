import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
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
  hasEnterprisePlugins?: boolean;
  user?: Partial<User>;
}

export const setup = async ({
  card = createMockCard(),
  settings = createMockSettings(),
  user,
  hasEnterprisePlugins = false,
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

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupTokenStatusEndpoint({ valid: hasEnterprisePlugins });

  const TestQuestionInfoSidebar = () => (
    <QuestionInfoSidebar question={question} onSave={onSave} />
  );

  renderWithProviders(<Route path="*" component={TestQuestionInfoSidebar} />, {
    withRouter: true,
    storeInitialState: state,
  });

  await waitForLoaderToBeRemoved();
};
