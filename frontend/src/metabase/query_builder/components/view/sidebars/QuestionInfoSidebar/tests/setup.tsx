import { Route } from "react-router";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Settings } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { QuestionInfoSidebar } from "../QuestionInfoSidebar";

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
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);

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

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
};
