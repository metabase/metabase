import userEvent from "@testing-library/user-event";
import {
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createStructuredModelCard,
} from "metabase-types/api/mocks/presets";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  waitForElementToBeRemoved,
  screen,
} from "__support__/ui";

import { getRoutes as getModelRoutes } from "metabase/models/routes";
import {
  Card,
  Database,
  StructuredDatasetQuery,
  WritebackQueryAction,
} from "metabase-types/api";

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const TEST_MODEL = createStructuredModelCard();

const TEST_ACTION = createMockQueryAction({ model_id: TEST_MODEL.id });

const TEST_TABLE = createOrdersTable();

async function setup({
  model = TEST_MODEL,
  actions = [TEST_ACTION],
  databases = [TEST_DATABASE_WITH_ACTIONS],
  initialRoute = `/model/${TEST_MODEL.id}/detail/actions/${TEST_ACTION.id}`,
}: {
  model?: Card<StructuredDatasetQuery>;
  actions?: WritebackQueryAction[];
  databases?: Database[];
  initialRoute?: string;
}) {
  setupDatabasesEndpoints(databases);
  setupCardsEndpoints([model]);
  setupModelActionsEndpoints(actions, model.id);
  setupTableEndpoints(TEST_TABLE);

  renderWithProviders(getModelRoutes(), {
    withRouter: true,
    initialRoute,
  });

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));
}

describe("ModelActionDetails", () => {
  it("should not leave ActionCreatorModal when clicking outside modal", async () => {
    await setup({});

    userEvent.click(document.body);

    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
  });

  it("should leave ActionCreatorModal when clicking 'Cancel'", async () => {
    await setup({});

    (await screen.findByText("Cancel")).click();

    expect(
      screen.queryByTestId("mock-native-query-editor"),
    ).not.toBeInTheDocument();
  });
});
