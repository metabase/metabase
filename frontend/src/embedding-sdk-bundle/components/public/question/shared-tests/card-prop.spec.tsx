import {
  setupAdhocQueryMetadataEndpoint,
  setupCardDataset,
  setupCollectionByIdEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseCard } from "embedding-sdk-bundle/types/question";
import { utf8_to_b64url } from "metabase/utils/encoding";
import {
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { TEST_COLUMN, TEST_DB, TEST_TABLE } from "./constants.spec";

export function addCardPropTests({
  Component,
}: {
  Component: (props: { card: string | MetabaseCard }) => React.ReactNode;
}) {
  describe("card prop", () => {
    const DATASET_QUERY = {
      database: TEST_DB.id,
      type: "query" as const,
      query: { "source-table": TEST_TABLE.id },
    };

    const CARD_STRING = utf8_to_b64url(
      JSON.stringify({ dataset_query: DATASET_QUERY }),
    );

    const CARD_OBJECT: MetabaseCard = {
      query: DATASET_QUERY,
      visualization: "table",
      visualizationSettings: {},
    };

    const QUERY_ONLY_CARD_OBJECT: MetabaseCard = {
      query: DATASET_QUERY,
    };

    // A category + numeric dataset so a bar chart has something to render.
    const BAR_CATEGORY_COLUMN = createMockColumn({
      name: "CATEGORY",
      display_name: "Category",
      base_type: "type/Text",
    });
    const BAR_VALUE_COLUMN = createMockColumn({
      name: "COUNT",
      display_name: "Count",
      base_type: "type/Integer",
    });
    const BAR_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [BAR_CATEGORY_COLUMN, BAR_VALUE_COLUMN],
        rows: [
          ["a", 10],
          ["b", 20],
          ["c", 30],
        ],
      }),
    });

    const BAR_CARD: MetabaseCard = {
      query: DATASET_QUERY,
      visualization: "bar",
      visualizationSettings: {
        "graph.dimensions": ["CATEGORY"],
        "graph.metrics": ["COUNT"],
      },
    };

    const TABLE_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [TEST_COLUMN],
        rows: [["Test Row"], ["Test Row 2"]],
      }),
    });

    async function setup(card: string | MetabaseCard, dataset = TABLE_DATASET) {
      const { state } = setupSdkState();

      setupNotificationChannelsEndpoints({ email: { configured: false } });
      setupAdhocQueryMetadataEndpoint(
        createMockCardQueryMetadata({ databases: [TEST_DB] }),
      );
      setupCardDataset({ dataset });
      setupCollectionByIdEndpoint({
        collections: [createMockCollection({ id: 1 })],
      });

      renderWithSDKProviders(<Component card={card} />, {
        componentProviderProps: { authConfig: createMockSdkConfig() },
        storeInitialState: state,
      });

      await waitForLoaderToBeRemoved();
    }

    beforeAll(() => {
      mockGetBoundingClientRect();
    });

    it("should render a visualization when given a serialized card string", async () => {
      await setup(CARD_STRING);

      expect(screen.getByTestId("query-visualization-root")).toBeVisible();
      expect(
        within(screen.getByTestId("table-root")).getByText(
          TEST_COLUMN.display_name,
        ),
      ).toBeVisible();
    });

    it("should render a visualization when given a card object", async () => {
      await setup(CARD_OBJECT);

      expect(screen.getByTestId("query-visualization-root")).toBeVisible();
      expect(
        within(screen.getByTestId("table-root")).getByText(
          TEST_COLUMN.display_name,
        ),
      ).toBeVisible();
    });

    it("should render a visualization when given a card object without a chosen visualization", async () => {
      await setup(QUERY_ONLY_CARD_OBJECT);

      expect(screen.getByTestId("query-visualization-root")).toBeVisible();
      expect(
        within(screen.getByTestId("table-root")).getByText(
          TEST_COLUMN.display_name,
        ),
      ).toBeVisible();
    });

    it("should honor the chosen `visualization` instead of defaulting to a table", async () => {
      await setup(BAR_CARD, BAR_DATASET);

      expect(screen.getByTestId("query-visualization-root")).toBeVisible();
      // The `bar` visualization is honored (and locked), so a chart renders...
      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
      expect(screen.queryByTestId("table-root")).not.toBeInTheDocument();
    });
  });
}
