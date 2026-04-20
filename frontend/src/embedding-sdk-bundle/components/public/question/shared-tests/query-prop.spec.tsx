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
import { utf8_to_b64url } from "metabase/utils/encoding";
import {
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { TEST_COLUMN, TEST_DB, TEST_TABLE } from "./constants.spec";

export function addQueryPropTests({
  Component,
}: {
  Component: (props: { query: string }) => React.ReactNode;
}) {
  describe("query prop", () => {
    const QUERY_PROP = utf8_to_b64url(
      JSON.stringify({
        dataset_query: {
          database: TEST_DB.id,
          type: "query",
          query: { "source-table": TEST_TABLE.id },
        },
      }),
    );

    async function setup() {
      const { state } = setupSdkState();

      setupNotificationChannelsEndpoints({ email: { configured: false } });
      setupAdhocQueryMetadataEndpoint(
        createMockCardQueryMetadata({ databases: [TEST_DB] }),
      );
      // Needs >1 row so Question.maybeResetDisplay doesn't force scalar.
      setupCardDataset({
        dataset: createMockDataset({
          data: createMockDatasetData({
            cols: [TEST_COLUMN],
            rows: [["Test Row"], ["Test Row 2"]],
          }),
        }),
      });
      setupCollectionByIdEndpoint({
        collections: [createMockCollection({ id: 1 })],
      });

      renderWithSDKProviders(<Component query={QUERY_PROP} />, {
        componentProviderProps: { authConfig: createMockSdkConfig() },
        storeInitialState: state,
      });

      await waitForLoaderToBeRemoved();
    }

    beforeAll(() => {
      mockGetBoundingClientRect();
    });

    it("should render a visualization when given a valid query base64 string", async () => {
      await setup();

      expect(screen.getByTestId("query-visualization-root")).toBeVisible();
      expect(
        within(screen.getByTestId("table-root")).getByText(
          TEST_COLUMN.display_name,
        ),
      ).toBeVisible();
      expect(
        within(screen.getAllByRole("gridcell")[0]).getByText("Test Row"),
      ).toBeVisible();
    });
  });
}
