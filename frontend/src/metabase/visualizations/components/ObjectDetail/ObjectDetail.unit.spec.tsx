import { setupTableEndpoints } from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { testDataset } from "__support__/testDataset";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import { ObjectDetail } from "metabase/visualizations/components/ObjectDetail/ObjectDetail";
import type { ObjectDetailProps } from "metabase/visualizations/components/ObjectDetail/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import { createMockCard } from "metabase-types/api/mocks";
import { createProductsTable } from "metabase-types/api/mocks/presets";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["object"]));

const DATABASE_ID = 1;

const MOCK_TABLE = createProductsTable();

const MOCK_CARD = createMockCard({
  dataset_query: {
    type: "query",
    database: DATABASE_ID,
    query: {
      "source-table": MOCK_TABLE.id,
    },
  },
});

async function setup(options?: Partial<ObjectDetailProps>) {
  setupTableEndpoints(MOCK_TABLE);

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
    <ObjectDetail
      data={testDataset}
      question={question}
      table={table}
      zoomedRow={testDataset.rows[0]}
      zoomedRowID={0}
      tableForeignKeys={table.fks}
      settings={{
        column: () => null,
      }}
      showHeader
      canZoom={true}
      canZoomPreviousRow={false}
      canZoomNextRow={false}
      onVisualizationClick={() => null}
      visualizationIsClickable={() => false}
      isDashboard={false}
      {...options}
    />,
    { storeInitialState: state },
  );

  await waitForLoaderToBeRemoved();
}

describe("ObjectDetail", () => {
  it("renders an object detail with a paginator", async () => {
    await setup();

    expect(screen.getByText(/Item 1 of 10/i)).toBeInTheDocument();
  });

  it("shows object detail header", async () => {
    await setup({
      settings: {
        "detail.showHeader": true,
      },
      showHeader: false,
    });

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
  });

  it("hides object detail header", async () => {
    await setup({
      settings: {
        "detail.showHeader": false,
      },
      showHeader: false,
    });

    expect(screen.queryByText(/Product/i)).not.toBeInTheDocument();
  });
});
