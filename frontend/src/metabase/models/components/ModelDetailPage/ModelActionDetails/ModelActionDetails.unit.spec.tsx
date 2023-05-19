import React from "react";
import fetchMock from "fetch-mock";
import {
  createMockDatabase,
  createMockField,
  createMockQueryAction,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import { Card } from "metabase-types/api";
import { createStructuredModelCard as _createStructuredModelCard } from "metabase-types/api/mocks/presets";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  waitForElementToBeRemoved,
  screen,
  fireEvent,
} from "__support__/ui";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import { TYPE } from "metabase-lib/types/constants";

function createStructuredModelCard(card?: Partial<Card>) {
  return _createStructuredModelCard({
    can_write: true,
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockStructuredDatasetQuery({
      database: TEST_DATABASE_ID,
      query: createMockStructuredQuery({ "source-table": TEST_TABLE_ID }),
    }),
  });
}

const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 1;
const TEST_FIELD = createMockField({
  id: 1,
  display_name: "Field 1",
  table_id: TEST_TABLE_ID,
});

const TEST_FK_TABLE_1_ID = 2;
const TEST_FK_FIELD = createMockField({
  id: 4,
  table_id: TEST_FK_TABLE_1_ID,
});
const TEST_FIELDS = [
  TEST_FIELD,
  createMockField({
    id: 2,
    display_name: "Field 2",
    table_id: TEST_TABLE_ID,
  }),
  createMockField({
    id: 3,
    display_name: "Field 3",
    table_id: TEST_TABLE_ID,
    semantic_type: TYPE.FK,
    fk_target_field_id: TEST_FK_FIELD.id,
    target: TEST_FK_FIELD,
  }),
];

const TEST_TABLE = createMockTable({
  id: TEST_TABLE_ID,
  name: "TEST_TABLE",
  display_name: "TEST_TABLE",
  fields: TEST_FIELDS,
  db_id: TEST_DATABASE_ID,
});

const TEST_FK_TABLE_1 = createMockTable({
  id: TEST_FK_TABLE_1_ID,
  name: "TEST_TABLE points to this",
  fields: [TEST_FK_FIELD],
});

const TEST_DATABASE = createMockDatabase({
  id: TEST_DATABASE_ID,
  name: "Test Database",
  tables: [TEST_TABLE, TEST_FK_TABLE_1],
});

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  ...TEST_DATABASE,
  settings: { "database-enable-actions": true },
});

const TEST_MODEL = createStructuredModelCard()

const TEST_ACTION = createMockQueryAction({ model_id: TEST_MODEL.id });

async function setup({
  model = TEST_MODEL,
  actions = [TEST_ACTION],
  databases = [TEST_DATABASE_WITH_ACTIONS],
  initialRoute = `/model/${TEST_MODEL.id}/detail/actions`
}) {
  setupDatabasesEndpoints(databases);
  setupCardsEndpoints([model]);
  setupModelActionsEndpoints(actions, model.id);

  const {container} = renderWithProviders(getModelRoutes(), {
    withRouter: true,
    initialRoute,
  });

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));

  return {container}
}

describe("ModelActionDetails", () => {
  it("should not leave ActionCreatorModal when clicking outside modal", async () => {
    const {container} = await setup({
      initialRoute: `/model/${TEST_MODEL.id}/detail/actions/${TEST_ACTION.id}`,
    });

    fireEvent.click(container.ownerDocument.body);

    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
  });

  it("should leave ActionCreatorModal when clicking 'Cancel'", async () => {
    await setup({
      initialRoute: `/model/${TEST_MODEL.id}/detail/actions/${TEST_ACTION.id}`,
    });

    screen.getByText("Cancel").click();

    expect(
      screen.queryByTestId("mock-native-query-editor"),
    ).not.toBeInTheDocument();
  });
});
