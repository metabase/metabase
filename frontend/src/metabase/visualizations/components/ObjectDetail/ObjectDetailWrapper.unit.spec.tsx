import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ObjectDetailWrapper } from "metabase/visualizations/components/ObjectDetail/ObjectDetailWrapper";
import type { ObjectDetailProps } from "metabase/visualizations/components/ObjectDetail/types";
import { testDataset } from "__support__/testDataset";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { createMockCard } from "metabase-types/api/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { createProductsTable } from "metabase-types/api/mocks/presets";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";

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
    <ObjectDetailWrapper
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
    { storeInitialState: state },
  );

  await waitFor(() =>
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument(),
  );
}

describe("Object Detail Wrapper", () => {
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

  it("traps focus in the object detail modal when opened", async () => {
    await setup({
      isObjectDetail: true,
    });

    await screen.findByTestId("object-detail");

    // first tab should focus on the close button, since there's only
    // one element to show here.
    userEvent.tab();
    expect(screen.getByTestId("object-detail-close-button")).toHaveFocus();

    // second tab should *keep* focus on the close button, not go
    // to the body
    userEvent.tab();
    expect(screen.getByTestId("object-detail-close-button")).toHaveFocus();
  });
});
