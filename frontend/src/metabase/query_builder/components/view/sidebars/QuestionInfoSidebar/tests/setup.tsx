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
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, NormalizedTable, Settings } from "metabase-types/api";
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
  sourceCard?: Card;
}

export const setup = async ({
  card = createMockCard(),
  sourceCard,
  settings = createMockSettings(),
  hasEnterprisePlugins,
}: SetupOpts) => {
  const currentUser = createMockUser();
  setupCardEndpoints(card);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);

  const state = createMockState({
    currentUser,
    settings: mockSettings(settings),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: sourceCard ? [card, sourceCard] : [card],
    }),
  });

  // 😫 all this is necessary to test a card as a question source
  if (sourceCard) {
    const virtualTable = convertSavedQuestionToVirtualTable(sourceCard);

    state.entities = {
      ...state.entities,
      tables: {
        ...(state.entities.tables as Record<number, NormalizedTable>),
        [virtualTable.id]: virtualTable,
      },
      databases: {
        [state.entities.databases[1].id]: {
          ...state.entities.databases[1],
          tables: [
            ...(state.entities.databases[1].tables ?? []),
            virtualTable.id,
          ],
        },
      },
    };
  }

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
