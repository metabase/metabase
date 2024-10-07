import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Settings, User } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

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
  hasEnterprisePlugins,
}: SetupOpts) => {
  const currentUser = createMockUser(user);
  setupCardEndpoints(card);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);

  fetchMock.get("path:/api/ee/audit-app/user/audit-info", {
    dashboard_overview: 201,
    question_overview: 202,
  });

  const state = createMockState({
    currentUser,
    settings: mockSettings(settings),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));
  const onSave = jest.fn();

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const TestQuestionInfoSidebar = () => (
    <QuestionInfoSidebar question={question} onSave={onSave} />
  );

  renderWithProviders(<Route path="*" component={TestQuestionInfoSidebar} />, {
    withRouter: true,
    storeInitialState: state,
  });

  await waitForLoaderToBeRemoved();
};
