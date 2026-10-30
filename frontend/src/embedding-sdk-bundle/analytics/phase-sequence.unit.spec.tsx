jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupNotificationChannelsEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import {
  setupCreateNotificationEndpoint,
  setupListNotificationEndpoints,
} from "__support__/server-mocks/notification";
import { screen, waitFor, waitForLoaderToBeRemoved } from "__support__/ui";
import { CollectionBrowserInner } from "embedding-sdk-bundle/components/public/CollectionBrowser/CollectionBrowser";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import { SdkDashboard } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboard";
import { setupSdkDashboard } from "embedding-sdk-bundle/components/public/dashboard/tests/setup";
import {
  TEST_DB,
  TEST_DATASET,
  TEST_TABLE,
} from "embedding-sdk-bundle/components/public/question/shared-tests/constants.spec";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { resetComponentSignals } from "./component-signals";
import { getPhaseOffsets, resetPhaseTimestamps } from "./phase-timestamps";

// useLocale is mocked at the module level; the cast accesses the mock API.
const useLocaleMock = useLocale as jest.Mock;

const TEST_CARD_ID = 1;
const COLLECTION_ID = 1;

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: false,
  effective_ancestors: [],
  id: "root",
});

const TEST_COLLECTION = createMockCollection({
  id: COLLECTION_ID,
  name: "Test Collection",
  can_write: true,
});

const TEST_CARD = createMockCard({
  id: TEST_CARD_ID,
  name: "Test Question",
  collection_id: COLLECTION_ID,
  collection: TEST_COLLECTION,
});

// For questions the flow is sequential: load → query → render → done.
const QUESTION_PHASES = [
  "component_start",
  "metadata_ready",
  "query_start",
  "query_end",
  "result_rendered",
];

// For dashboards, result_rendered fires before query_end: both respond to the
// same store update (all cards loaded) but useReportComponentReady's effect
// runs before the handleLoad callback in React's effect ordering.
const DASHBOARD_PHASES = [
  "component_start",
  "metadata_ready",
  "query_start",
  "result_rendered",
  "query_end",
];

/**
 * Asserts that the recorded phase keys match the expected sequence and that
 * each offset is monotone non-decreasing (phases fire in chronological order).
 */
function expectPhaseSequence(expected: string[]): void {
  const offsets = getPhaseOffsets(0);
  expect(offsets).not.toBeNull();

  expect(Object.keys(offsets!)).toEqual(expected);

  const values = Object.values(offsets!);
  for (let i = 1; i < values.length; i++) {
    expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  }
}

describe("SDK component phase sequence", () => {
  beforeEach(() => {
    resetPhaseTimestamps();
    resetComponentSignals();
    useLocaleMock.mockReturnValue({ isLocaleLoading: false });
  });

  describe("SdkDashboard", () => {
    it("fires all query phases in order", async () => {
      await setupSdkDashboard({ component: SdkDashboard });

      await waitFor(() => {
        expect(getPhaseOffsets(0)).toHaveProperty("query_end");
      });

      expectPhaseSequence(DASHBOARD_PHASES);
    });
  });

  describe("StaticQuestion", () => {
    it("fires all query phases in order", async () => {
      setupNotificationChannelsEndpoints({ email: { configured: true } });
      setupCardEndpoints(TEST_CARD);
      setupCardQueryMetadataEndpoint(
        TEST_CARD,
        createMockCardQueryMetadata({ databases: [TEST_DB] }),
      );
      setupAlertsEndpoints(TEST_CARD, []);
      setupDatabaseEndpoints(TEST_DB);
      setupTableEndpoints(TEST_TABLE);
      setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);
      setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
      setupListNotificationEndpoints({ card_id: TEST_CARD.id }, []);
      setupUserRecipientsEndpoint({ users: [] });
      setupWebhookChannelsEndpoint();
      setupCreateNotificationEndpoint();

      const { state } = setupSdkState({});

      renderWithSDKProviders(<StaticQuestion questionId={TEST_CARD_ID} />, {
        componentProviderProps: { authConfig: createMockSdkConfig() },
        storeInitialState: state,
      });

      await waitForLoaderToBeRemoved();

      await waitFor(() => {
        expect(getPhaseOffsets(0)).toHaveProperty("result_rendered");
      });

      expectPhaseSequence(QUESTION_PHASES);
    });
  });

  describe("CollectionBrowser", () => {
    it("fires component_start → result_rendered", async () => {
      setupCollectionsEndpoints({
        collections: [ROOT_TEST_COLLECTION],
        rootCollection: ROOT_TEST_COLLECTION,
      });
      setupCollectionItemsEndpoint({
        collection: ROOT_TEST_COLLECTION,
        collectionItems: [
          createMockCollectionItem({ id: 2, model: "dashboard" }),
        ],
      });

      const { state } = setupSdkState({});

      renderWithSDKProviders(<CollectionBrowserInner collectionId="root" />, {
        componentProviderProps: { authConfig: createMockSdkConfig() },
        storeInitialState: state,
      });

      expect(await screen.findByTestId("collection-table")).toBeInTheDocument();

      await waitFor(() => {
        expect(getPhaseOffsets(0)).toHaveProperty("result_rendered");
      });

      expectPhaseSequence(["component_start", "result_rendered"]);
    });
  });
});
