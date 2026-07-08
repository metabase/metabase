import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { act, screen, waitFor, waitForLoaderToBeRemoved } from "__support__/ui";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types";
import type { CardId } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { SdkQuestion, type SdkQuestionProps } from "./SdkQuestion";

const TEST_USER = createMockUser();
const TEST_DB_ID = 1;
const TEST_DB = createMockDatabase({ id: TEST_DB_ID });

const TEST_TABLE_ID = 1;
const TEST_TABLE = createMockTable({ id: TEST_TABLE_ID, db_id: TEST_DB_ID });

const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});

const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [TEST_COLUMN],
    rows: [["Test Row"]],
  }),
});

const TEST_CARD_ID: CardId = 1 as const;
const TEST_CARD = createMockCard({ id: TEST_CARD_ID, name: "My Question" });

// A card with a different object reference than TEST_CARD, used as nextCard
// so runQuestionOnNavigateSdk doesn't bail out early on reference equality.
const NEXT_CARD = { ...TEST_CARD };

const DrillTrigger = ({ params }: { params: NavigateToNewCardParams }) => {
  const { navigateToNewCard } = useSdkQuestionContext();

  return (
    <button onClick={() => navigateToNewCard?.(params)}>Trigger Drill</button>
  );
};

const setup = async ({
  onDrillThrough,
}: {
  onDrillThrough?: SdkQuestionProps["onDrillThrough"];
}) => {
  const { state } = setupSdkState({ currentUser: TEST_USER });

  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);
  setupCardEndpoints(TEST_CARD);
  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );

  const drillParams: NavigateToNewCardParams = {
    nextCard: NEXT_CARD,
    previousCard: TEST_CARD,
    objectId: 1,
    drillName: "drill-thru/pk",
  };

  renderWithSDKProviders(
    <SdkQuestion questionId={TEST_CARD_ID} onDrillThrough={onDrillThrough}>
      <DrillTrigger params={drillParams} />
    </SdkQuestion>,
    {
      componentProviderProps: { authConfig: createMockSdkConfig() },
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();
};

describe("SdkQuestion onDrillThrough", () => {
  it("triggers navigation when defaultNavigate is called", async () => {
    const queryPath = `path:/api/card/${TEST_CARD.id}/query`;

    let defaultNavigate: (() => Promise<void>) | undefined;

    const onDrillThrough = jest.fn(async (_, _defaultNavigate) => {
      defaultNavigate = _defaultNavigate;
    });

    await setup({ onDrillThrough });

    await userEvent.click(screen.getByText("Trigger Drill"));

    // Should be called with drill names and next card
    expect(onDrillThrough).toHaveBeenCalledWith(
      { drillName: "drill-thru/pk", nextCard: NEXT_CARD },
      expect.any(Function),
    );

    // One card query: defaultNavigate hasn't been called yet
    expect(fetchMock.callHistory.calls(queryPath)).toHaveLength(1);

    await act(async () => {
      await defaultNavigate?.();
    });

    // Two card query: defaultNavigate is called
    await waitFor(() => {
      expect(fetchMock.callHistory.calls(queryPath)).toHaveLength(2);
    });
  });
});
