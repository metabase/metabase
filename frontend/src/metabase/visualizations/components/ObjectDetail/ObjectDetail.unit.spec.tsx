import { render, screen, within } from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import {
  setupActionsEndpoints,
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { testDataset } from "__support__/testDataset";
import { renderWithProviders } from "__support__/ui";
import {
  createMockCard,
  createMockDatabase,
  createMockImplicitQueryAction,
  createMockQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import Question from "metabase-lib/Question";
import type { ObjectDetailProps } from "./types";
import {
  ObjectDetailView,
  ObjectDetailHeader,
  ObjectDetailBody,
} from "./ObjectDetail";

const MOCK_CARD = createMockCard({
  name: "Product",
});

const MOCK_TABLE = createMockTable({
  name: "Product",
  display_name: "Product",
});

const mockQuestion = new Question(
  createMockCard({
    name: "Product",
  }),
);

const ACTIONS_ENABLED_DB_ID = 1;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      id: ACTIONS_ENABLED_DB_ID,
      settings: { "database-enable-actions": true },
    }),
  ],
});

const mockDataset = new Question(
  createMockCard({
    name: "Product",
    dataset: true,
    dataset_query: {
      type: "query",
      database: ACTIONS_ENABLED_DB_ID,
      query: {
        "source-table": PEOPLE_ID,
      },
    },
  }),
  metadata,
);

const databaseWithEnabledActions = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const implicitCreateAction = createMockImplicitQueryAction({
  id: 1,
  database_id: databaseWithEnabledActions.id,
  name: "Create",
  kind: "row/create",
});

const implicitDeleteAction = createMockImplicitQueryAction({
  id: 2,
  database_id: databaseWithEnabledActions.id,
  name: "Delete",
  kind: "row/delete",
});

const implicitUpdateAction = createMockImplicitQueryAction({
  id: 3,
  database_id: databaseWithEnabledActions.id,
  name: "Update",
  kind: "row/update",
});

const implicitArchivedUpdateAction = {
  ...implicitUpdateAction,
  name: "Archived Implicit Update",
  id: 4,
  archived: true,
};

const queryAction = createMockQueryAction({
  id: 5,
  name: "Query action",
});

function setup(options?: Partial<ObjectDetailProps>) {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [MOCK_CARD],
      tables: [MOCK_TABLE],
    }),
    qb: createMockQueryBuilderState({ card: MOCK_CARD }),
  });
  const metadata = getMetadata(state);

  const question = checkNotNull(metadata.question(MOCK_CARD.id));
  const table = checkNotNull(metadata.table(MOCK_TABLE.id));

  renderWithProviders(
    <ObjectDetailView
      data={testDataset}
      question={question}
      table={table}
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

describe("Object Detail", () => {
  it("renders an object detail header", () => {
    render(
      <ObjectDetailHeader
        actionItems={[]}
        canZoom={false}
        objectName="Large Sandstone Socks"
        objectId={778}
        canZoomNextRow={false}
        canZoomPreviousRow={false}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
        closeObjectDetail={() => null}
      />,
    );
    expect(screen.getByText(/Large Sandstone Socks/i)).toBeInTheDocument();
    expect(screen.getByText(/778/i)).toBeInTheDocument();
  });

  it("renders an object detail header with enabled next object button and disabled previous object button", () => {
    render(
      <ObjectDetailHeader
        actionItems={[]}
        canZoom={true}
        objectName="Large Sandstone Socks"
        objectId={778}
        canZoomNextRow={true}
        canZoomPreviousRow={false}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
        closeObjectDetail={() => null}
      />,
    );
    const nextDisabled = screen
      .getByTestId("view-next-object-detail")
      .getAttribute("disabled");

    const prevDisabled = screen
      .getByTestId("view-previous-object-detail")
      .getAttribute("disabled");

    expect(nextDisabled).toBeNull();
    expect(prevDisabled).not.toBeNull();
  });

  it("renders an object detail body", () => {
    render(
      <ObjectDetailBody
        data={testDataset}
        objectName="Large Sandstone Socks"
        zoomedRow={testDataset.rows[2]}
        settings={{
          column: () => null,
        }}
        hasRelationships={false}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        tableForeignKeys={[]}
        tableForeignKeyReferences={{}}
        followForeignKey={() => null}
      />,
    );

    expect(screen.getByText("Synergistic Granite Chair")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
  });

  it("renders an object detail component", () => {
    setup();

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
    setup({ zoomedRowID: "101", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(
      await screen.findByText(/Extremely Hungry Toucan/i),
    ).toBeInTheDocument();
  });

  it("shows not found if it can't find a missing row", async () => {
    setupCardDataset({ data: { rows: [] } });

    // because this row is not in the test dataset, it should trigger a fetch
    setup({ zoomedRowID: "102", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(await screen.findByText(/we're a little lost/i)).toBeInTheDocument();
  });

  it("renders actions menu", async () => {
    setupDatabasesEndpoints([databaseWithEnabledActions]);
    setupActionsEndpoints([
      implicitCreateAction,
      implicitDeleteAction,
      implicitUpdateAction,
      implicitArchivedUpdateAction,
      queryAction,
    ]);
    setup({ question: mockDataset });

    const actionsMenu = await screen.findByTestId("actions-menu");
    expect(actionsMenu).toBeInTheDocument();
    userEvent.click(actionsMenu);

    const popover = screen.getByTestId("popover");
    expect(
      within(popover).queryByText(implicitCreateAction.name),
    ).not.toBeInTheDocument();
    expect(
      within(popover).getByText(implicitUpdateAction.name),
    ).toBeInTheDocument();
    expect(
      within(popover).getByText(implicitDeleteAction.name),
    ).toBeInTheDocument();
    expect(
      within(popover).queryByText(implicitArchivedUpdateAction.name),
    ).not.toBeInTheDocument();
    expect(
      within(popover).queryByText(queryAction.name),
    ).not.toBeInTheDocument();
  });

  it("does not render actions menu for non-model questions", async () => {
    setupDatabasesEndpoints([databaseWithEnabledActions]);
    setupActionsEndpoints([
      implicitCreateAction,
      implicitDeleteAction,
      implicitUpdateAction,
      implicitArchivedUpdateAction,
      queryAction,
    ]);
    setup({ question: mockQuestion });

    const actionsMenu = screen.queryByTestId("actions-menu");
    expect(actionsMenu).not.toBeInTheDocument();
  });
});
