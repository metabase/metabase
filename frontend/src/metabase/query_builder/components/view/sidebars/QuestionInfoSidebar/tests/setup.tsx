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
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupRevisionsEndpoints } from "__support__/server-mocks/revision";
import { QuestionInfoSidebar } from "../QuestionInfoSidebar";

interface SetupOpts {
  card?: Card;
  settings?: Settings;
}

export const setup = async ({
  card = createMockCard(),
  settings = createMockSettings(),
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

  renderWithProviders(
    <QuestionInfoSidebar question={question} onSave={onSave} />,
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));

  return { onSave };
};
