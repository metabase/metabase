import { waitForElementToBeRemoved, within } from "@testing-library/react";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import type { Card, Dataset } from "metabase-types/api";
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

import { InteractiveQuestion } from "./InteractiveQuestion";

const TEST_USER = createMockUser();
const TEST_DB_ID = 1;
const TEST_DB = createMockDatabase({ id: TEST_DB_ID });

const TEST_TABLE_ID = 1;
const TEST_TABLE = createMockTable({ id: TEST_TABLE_ID, db_id: TEST_DB_ID });

const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});

function getMockDataset(row: string) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [TEST_COLUMN],
      rows: [[row]],
    }),
  });
}

const setup = ({
  mocks = [
    {
      card: createMockCard(),
      dataset: getMockDataset("Test Row"),
    },
  ],
}: {
  mocks?: { card: Card; dataset: Dataset }[];
} = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  for (const mock of mocks) {
    const { card, dataset } = mock;

    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    setupAlertsEndpoints(card, []);
    setupCardQueryEndpoints(card, dataset);
  }

  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);

  const children = (
    <div>
      {mocks.map(mock => (
        <InteractiveQuestion key={mock.card.id} questionId={mock.card.id} />
      ))}
    </div>
  );

  return renderWithProviders(children, {
    mode: "sdk",
    sdkProviderProps: {
      config: createMockAuthProviderUriConfig({
        authProviderUri: "http://TEST_URI/sso/metabase",
      }),
    },
    storeInitialState: state,
  });
};

describe("InteractiveQuestion - multiple interactive questions", () => {
  it("should render multiple valid questions", async () => {
    const rows = ["A", "B"];

    const mocks = rows.map((row, id) => ({
      card: createMockCard({ id: id + 1 }),
      dataset: getMockDataset(row),
    }));

    setup({ mocks });

    // Both loading indicators should be removed
    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-indicator"),
    );

    const tables = screen.getAllByTestId("TableInteractive-root");
    const gridcells = screen.getAllByRole("gridcell");

    expect(tables).toHaveLength(rows.length);
    expect(gridcells).toHaveLength(rows.length);

    for (let i = 0; i < rows.length; i++) {
      expect(
        within(tables[i]).getByText(TEST_COLUMN.display_name),
      ).toBeInTheDocument();

      expect(within(gridcells[i]).getByText(rows[i])).toBeInTheDocument();
    }
  });
});
