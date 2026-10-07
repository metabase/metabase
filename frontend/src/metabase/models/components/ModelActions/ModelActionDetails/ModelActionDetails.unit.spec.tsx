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
import { Route } from "metabase/router";
import type {
  Card,
  Database,
  StructuredDatasetQuery,
  WritebackAction,
} from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockImplicitQueryAction,
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

const TEST_ACTION = createMockImplicitQueryAction({ model_id: TEST_MODEL.id });

async function setup({
  model = TEST_MODEL,
  actions = [TEST_ACTION],
  database = TEST_DATABASE_WITH_ACTIONS,
  initialRoute = `/model/${TEST_MODEL.id}/detail/actions/${TEST_ACTION.id}`,
}: {
  model?: Card<StructuredDatasetQuery>;
  actions?: WritebackAction[];
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

  renderWithProviders(
    <>
      {getModelRoutes()}
      <Route
        path="/data-studio/data-actions/:actionId"
        element={<div data-testid="data-action-page" />}
      />
    </>,
    { withRouter: true, initialRoute },
  );

  await waitForLoaderToBeRemoved();
}

describe("ModelActionDetails", () => {
  it("should not leave ActionCreatorModal when clicking outside modal", async () => {
    await setup({});

    await userEvent.click(document.body);

    expect(await screen.findByTestId("action-creator")).toBeInTheDocument();
  });

  it("should leave ActionCreatorModal when clicking 'Cancel'", async () => {
    await setup({});

    await userEvent.click(await screen.findByText("Cancel"));

    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
  });

  it("should redirect a query action to Data Studio", async () => {
    const action = createMockQueryAction({ id: 2 });
    await setup({
      actions: [action],
      initialRoute: `/model/${TEST_MODEL.id}/detail/actions/${action.id}`,
    });

    expect(await screen.findByTestId("data-action-page")).toBeInTheDocument();
  });
});
