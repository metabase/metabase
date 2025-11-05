import userEvent from "@testing-library/user-event";

import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import type {
  Card,
  Database,
  StructuredDatasetQuery,
  WritebackQueryAction,
} from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createStructuredModelCard,
} from "metabase-types/api/mocks/presets";

const TEST_DATABASE_WITH_ACTIONS = createSampleDatabase({
  settings: { "database-enable-actions": true },
});

const TEST_MODEL = createStructuredModelCard();

const TEST_ACTION = createMockQueryAction({ model_id: TEST_MODEL.id });

async function setup({
  model = TEST_MODEL,
  actions = [TEST_ACTION],
  database = TEST_DATABASE_WITH_ACTIONS,
  initialRoute = `/model/${TEST_MODEL.id}/detail/actions/${TEST_ACTION.id}`,
}: {
  model?: Card<StructuredDatasetQuery>;
  actions?: WritebackQueryAction[];
  database?: Database;
  initialRoute?: string;
}) {
  setupDatabasesEndpoints([database]);
  setupCardsEndpoints([model]);
  setupCardQueryMetadataEndpoint(
    model,
    createMockCardQueryMetadata({ databases: [database] }),
  );
  setupModelActionsEndpoints(actions, model.id);

  renderWithProviders(getModelRoutes(), {
    withRouter: true,
    initialRoute,
  });

  await waitForLoaderToBeRemoved();
}

describe("ModelActionDetails", () => {
  it("should not leave ActionCreatorModal when clicking outside modal", async () => {
    await setup({});

    await userEvent.click(document.body);

    const mockQueryEditor = await screen.findByTestId(
      "mock-native-query-editor",
    );

    expect(mockQueryEditor).toBeInTheDocument();
  });

  it("should leave ActionCreatorModal when clicking 'Cancel'", async () => {
    await setup({});

    await userEvent.click(await screen.findByText("Cancel"));

    expect(
      screen.queryByTestId("mock-native-query-editor"),
    ).not.toBeInTheDocument();
  });
});
