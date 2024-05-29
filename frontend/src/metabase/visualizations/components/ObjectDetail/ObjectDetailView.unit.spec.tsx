import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupActionsEndpoints,
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { testDataset } from "__support__/testDataset";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import type { WritebackAction } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockImplicitQueryAction,
  createMockQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { ObjectDetailView } from "./ObjectDetailView";
import type { ObjectDetailProps } from "./types";

const mockCard = createMockCard({
  id: getNextId(),
  name: "Product",
});

const mockTable = createMockTable({
  id: getNextId(),
});

const mockTableNoPk = createMockTable({
  id: getNextId(),
  fields: [],
});

const mockTableMultiplePks = createMockTable({
  id: getNextId(),
  fields: [
    createMockField({ semantic_type: "type/PK" }),
    createMockField({ semantic_type: "type/PK" }),
  ],
});

const databaseWithActionsEnabled = createMockDatabase({
  id: getNextId(),
  settings: { "database-enable-actions": true },
});

const databaseWithActionsDisabled = createMockDatabase({
  id: getNextId(),
  settings: { "database-enable-actions": false },
});

const mockDatasetCard = createMockCard({
  id: getNextId(),
  type: "model",
  dataset_query: {
    type: "query",
    database: databaseWithActionsEnabled.id,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
});

const mockDatasetNoPkCard = createMockCard({
  id: getNextId(),
  type: "model",
  dataset_query: {
    type: "query",
    database: databaseWithActionsEnabled.id,
    query: {
      "source-table": mockTableNoPk.id,
    },
  },
});

const mockDatasetMultiplePksCard = createMockCard({
  id: getNextId(),
  type: "model",
  dataset_query: {
    type: "query",
    database: databaseWithActionsEnabled.id,
    query: {
      "source-table": mockTableMultiplePks.id,
    },
  },
});

const mockDatasetWithClausesCard = createMockCard({
  id: getNextId(),
  type: "model",
  dataset_query: {
    type: "query",
    database: databaseWithActionsEnabled.id,
    query: {
      "source-table": PEOPLE_ID,
      filter: [
        "contains",
        ["field", PEOPLE.NAME, null],
        "Macy",
        { "case-sensitive": false },
      ],
    },
  },
});

const mockDatasetNoWritePermissionCard = createMockCard({
  id: getNextId(),
  can_write: false,
  type: "model",
  dataset_query: {
    type: "query",
    database: databaseWithActionsEnabled.id,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
});

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      id: databaseWithActionsEnabled.id,
      settings: { "database-enable-actions": true },
    }),
  ],
  tables: [mockTable, mockTableMultiplePks, mockTableNoPk],
  questions: [
    mockCard,
    mockDatasetCard,
    mockDatasetNoPkCard,
    mockDatasetMultiplePksCard,
    mockDatasetWithClausesCard,
    mockDatasetNoWritePermissionCard,
  ],
});

const mockQuestion = checkNotNull(metadata.question(mockCard.id));

const mockDataset = checkNotNull(metadata.question(mockDatasetCard.id));

const mockDatasetNoPk = checkNotNull(metadata.question(mockDatasetNoPkCard.id));

const mockDatasetMultiplePks = checkNotNull(
  metadata.question(mockDatasetMultiplePksCard.id),
);

const mockDatasetWithClauses = checkNotNull(
  metadata.question(mockDatasetWithClausesCard.id),
);

const mockDatasetNoWritePermission = checkNotNull(
  metadata.question(mockDatasetNoWritePermissionCard.id),
);

const implicitCreateAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: databaseWithActionsEnabled.id,
  name: "Create",
  kind: "row/create",
});

const implicitDeleteAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: databaseWithActionsEnabled.id,
  name: "Delete",
  kind: "row/delete",
});

const implicitUpdateAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: databaseWithActionsEnabled.id,
  name: "Update",
  kind: "row/update",
});

const implicitPublicUpdateAction = {
  ...implicitUpdateAction,
  id: getNextId(),
  name: "Public Update",
  public_uuid: "mock-uuid",
};

const implicitPublicDeleteAction = {
  ...implicitDeleteAction,
  id: getNextId(),
  name: "Public Delete",
  public_uuid: "mock-uuid",
};

const implicitArchivedUpdateAction = {
  ...implicitUpdateAction,
  id: getNextId(),
  name: "Archived Implicit Update",
  archived: true,
};

const implicitArchivedDeleteAction = {
  ...implicitDeleteAction,
  id: getNextId(),
  name: "Archived Implicit Delete",
  archived: true,
};

const queryAction = createMockQueryAction({
  id: getNextId(),
  name: "Query action",
});

const actions = [
  implicitCreateAction,
  implicitDeleteAction,
  implicitUpdateAction,
  implicitPublicUpdateAction,
  implicitPublicDeleteAction,
  implicitArchivedUpdateAction,
  implicitArchivedDeleteAction,
  queryAction,
];

const actionsFromDatabaseWithDisabledActions = actions.map(action => ({
  ...action,
  database_id: databaseWithActionsDisabled.id,
}));

function setupPrefetch() {
  fetchMock.get(`path:/api/action/${implicitUpdateAction.id}/execute`, {});
}

function setup(
  options: Partial<ObjectDetailProps> &
    Required<Pick<ObjectDetailProps, "question">>,
) {
  renderWithProviders(
    <ObjectDetailView
      data={testDataset}
      zoomedRow={testDataset.rows[0]}
      zoomedRowID={0}
      tableForeignKeys={[]}
      tableForeignKeyReferences={[]}
      settings={{
        column: () => null,
      }}
      showHeader
      canZoom={true}
      canZoomPreviousRow={false}
      canZoomNextRow={false}
      followForeignKey={() => null}
      onVisualizationClick={() => null}
      visualizationIsClickable={() => false}
      fetchTableFks={() => null}
      loadObjectDetailFKReferences={() => null}
      viewPreviousObjectDetail={() => null}
      viewNextObjectDetail={() => null}
      closeObjectDetail={() => null}
      {...options}
    />,
  );
}

describe("ObjectDetailView", () => {
  it("renders an object detail component", () => {
    setup({ question: mockQuestion });

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][2]).toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][3]).toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][4]).toString()),
    ).toBeInTheDocument();
  });

  it("fetches a missing row", async () => {
    setupCardDataset({
      data: {
        rows: [
          [
            "101",
            "1807963902339",
            "Extremely Hungry Toucan",
            "Gizmo",
            "Larson, Pfeffer and Klocko",
            31.78621880685793,
            4.3,
            "2017-01-09T09:51:20.352-07:00",
          ],
        ],
      },
    });

    // because this row is not in the test dataset, it should trigger a fetch
    setup({ question: mockQuestion, zoomedRowID: "101", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(
      await screen.findByText(/Extremely Hungry Toucan/i),
    ).toBeInTheDocument();
  });

  it("shows not found if it can't find a missing row", async () => {
    setupCardDataset({ data: { rows: [] } });

    // because this row is not in the test dataset, it should trigger a fetch
    setup({ question: mockQuestion, zoomedRowID: "102", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(await screen.findByText(/we're a little lost/i)).toBeInTheDocument();
  });

  describe("renders actions menu", () => {
    beforeEach(() => {
      setupDatabasesEndpoints([databaseWithActionsEnabled]);
      setupActionsEndpoints(actions);
      setup({ question: mockDataset });
    });

    it("should not show implicit create action", async () => {
      const action = await findActionInActionMenu(implicitCreateAction);
      expect(action).not.toBeInTheDocument();
    });

    it("should show implicit update action", async () => {
      const action = await findActionInActionMenu(implicitUpdateAction);
      expect(action).toBeInTheDocument();
    });

    it("should show implicit delete action", async () => {
      const action = await findActionInActionMenu(implicitDeleteAction);
      expect(action).toBeInTheDocument();
    });

    it("should not show implicit public update action", async () => {
      const action = await findActionInActionMenu(implicitPublicUpdateAction);
      expect(action).not.toBeInTheDocument();
    });

    it("should not show implicit public delete action", async () => {
      const action = await findActionInActionMenu(implicitPublicDeleteAction);
      expect(action).not.toBeInTheDocument();
    });

    it("should not show implicit archived update action", async () => {
      const action = await findActionInActionMenu(implicitArchivedUpdateAction);
      expect(action).not.toBeInTheDocument();
    });

    it("should not show implicit archived delete action", async () => {
      const action = await findActionInActionMenu(implicitArchivedDeleteAction);
      expect(action).not.toBeInTheDocument();
    });

    it("should not show query action", async () => {
      const action = await findActionInActionMenu(queryAction);
      expect(action).not.toBeInTheDocument();
    });
  });

  it("should not render actions menu for models based on database with actions disabled", async () => {
    setupDatabasesEndpoints([databaseWithActionsDisabled]);
    setupActionsEndpoints(actionsFromDatabaseWithDisabledActions);
    setup({ question: mockDataset });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it("should not render actions menu for non-model questions", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockQuestion });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it(`should not render actions menu when "showControls" is "false"`, async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDataset, showControls: false });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it("should render actions menu when user has write permission", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDataset });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeInTheDocument();
  });

  it("should not render actions menu when user has no write permission", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDatasetNoWritePermission });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  /**
   * This is an exotic case. It's not possible to enable implicit actions
   * for a model with clauses (joins, expressions, filters, etc.).
   * Implicit actions are supported only in very simple models.
   */
  it("should not render actions menu when model's query has clauses", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDatasetWithClauses });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it("should not render actions menu when model's source table does not have a primary key", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDatasetNoPk });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it("should not render actions menu when model's source table has multiple primary keys", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDatasetMultiplePks });

    const actionsMenu = await findActionsMenu();
    expect(actionsMenu).toBeUndefined();
  });

  it("should show update object modal on update action click", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDataset });
    setupPrefetch();

    expect(
      screen.queryByTestId("action-execute-modal"),
    ).not.toBeInTheDocument();

    const action = await findActionInActionMenu(implicitUpdateAction);
    expect(action).toBeInTheDocument();
    await userEvent.click(action!);

    expect(
      screen.queryByText("Choose a record to update"),
    ).not.toBeInTheDocument();

    const modal = await screen.findByTestId("action-execute-modal");
    expect(modal).toBeInTheDocument();

    expect(within(modal).getByTestId("modal-header")).toHaveTextContent(
      "Update",
    );
  });

  it("should show delete object modal on delete action click", async () => {
    setupDatabasesEndpoints([databaseWithActionsEnabled]);
    setupActionsEndpoints(actions);
    setup({ question: mockDataset });

    expect(screen.queryByTestId("delete-object-modal")).not.toBeInTheDocument();

    const action = await findActionInActionMenu(implicitDeleteAction);
    expect(action).toBeInTheDocument();
    action?.click();

    const modal = await screen.findByTestId("delete-object-modal");
    expect(modal).toBeInTheDocument();

    expect(within(modal).getByTestId("modal-header")).toHaveTextContent(
      "Are you sure you want to delete this row?",
    );
  });
});

async function findActionInActionMenu({ name }: Pick<WritebackAction, "name">) {
  const actionsMenu = await screen.findByTestId("actions-menu");
  await userEvent.click(actionsMenu);
  const popover = await screen.findByRole("dialog");
  const action = within(popover).queryByText(name);
  return action;
}

/**
 * There is no loading state for useActionListQuery & useDatabaseListQuery
 * in ObjectDetail component, so there is no easy way to wait for relevant
 * API requests to finish. This function relies on DOM changes instead.
 */
async function findActionsMenu() {
  try {
    return await screen.findByTestId("actions-menu");
  } catch (error) {
    return undefined;
  }
}
