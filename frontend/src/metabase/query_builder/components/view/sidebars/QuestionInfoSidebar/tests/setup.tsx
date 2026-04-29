import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupAuditInfoEndpoint,
  setupCardEndpoints,
  setupCardsUsingModelEndpoint,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { createMockEntitiesState } from "__support__/store";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { getQuestion } from "metabase/query_builder/selectors";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import type { Card, Settings, User } from "metabase-types/api";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QuestionInfoSidebar } from "../QuestionInfoSidebar";

export interface SetupOpts {
  card?: Card;
  settings?: Settings;
  user?: Partial<User>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = async ({
  card = createMockCard(),
  settings,
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

  const builder = createScenario()
    .withUser(currentUser)
    .withEnterprise({ plugins: enterprisePlugins });
  if (settings) {
    builder.withSettings(settings as unknown as Record<string, unknown>);
  }
  const { render } = builder.build();

  // Re-derive the qb state so the selector below can pick the current card.
  const stateForSelector = createMockState({
    currentUser,
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const question = checkNotNull(getQuestion(stateForSelector));
  const onSave = jest.fn();

  const TestQuestionInfoSidebar = () => (
    <QuestionInfoSidebar question={question} onSave={onSave} />
  );

  render(<Route path="*" component={TestQuestionInfoSidebar} />, {
    withRouter: true,
    storeInitialState: {
      qb: createMockQueryBuilderState({ card }),
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
        questions: [card],
      }),
    },
  });

  await waitForLoaderToBeRemoved();
};
