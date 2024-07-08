import { waitForElementToBeRemoved, within } from "@testing-library/react";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardQueryEndpoints,
  setupDatabaseEndpoints,
  setupTableEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
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

import {
  getQuestionParameters,
  InteractiveQuestion,
} from "./InteractiveQuestion";

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
  isValidCard = true,
  mocks = [{ card: createMockCard(), dataset: getMockDataset("Test Row") }],
}: {
  isValidCard?: boolean;
  mocks?: { card: Card; dataset: Dataset }[];
} = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  for (const mock of mocks) {
    const { card, dataset } = mock;

    if (isValidCard) {
      setupCardEndpoints(card);
      setupCardQueryMetadataEndpoint(
        card,
        createMockCardQueryMetadata({ databases: [TEST_DB] }),
      );
    } else {
      setupUnauthorizedCardEndpoints(card);
    }

    setupAlertsEndpoints(card, []);
    setupCardQueryEndpoints(card, dataset);
  }

  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);

  const children = (
    <div>
      {mocks.map(mock => (
        <InteractiveQuestion key={mock.card.id} questionId={mock.card.id}>
          <InteractiveQuestionTestResult id={mock.card.id} />
        </InteractiveQuestion>
      ))}
    </div>
  );

  return renderWithProviders(children, {
    mode: "sdk",
    sdkConfig: createMockConfig({
      jwtProviderUri: "http://TEST_URI/sso/metabase",
    }),
    storeInitialState: state,
  });
};

// Provides a button to re-run the query
function InteractiveQuestionTestResult({ id }: { id: number }) {
  const { resetQuestion } = useInteractiveQuestionContext();

  return (
    <div>
      <button onClick={resetQuestion}>Run Query {id}</button>
      <InteractiveQuestionResult withTitle />
    </div>
  );
}

describe("InteractiveQuestion", () => {
  it("should initially render with a loader", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render when question is valid", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(
      within(screen.getByTestId("TableInteractive-root")).getByText(
        TEST_COLUMN.display_name,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

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

  it("should render loading state when rerunning the query", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(
      await within(screen.getByTestId("TableInteractive-root")).findByText(
        TEST_COLUMN.display_name,
      ),
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole("gridcell")).findByText("Test Row"),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

    // Simulate drilling down by re-running the query again
    act(() => screen.getByText("Run Query 1").click());

    expect(screen.queryByText("Question not found")).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(
      within(await screen.findByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  it("should not render an error if a question isn't found before the question loaded", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.queryByText("Error")).not.toBeInTheDocument();
    expect(screen.queryByText("Question not found")).not.toBeInTheDocument();
  });

  it("should render an error if a question isn't found", async () => {
    setup({ isValidCard: false });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Question not found")).toBeInTheDocument();
  });

  describe("getQuestionParameters", () => {
    it("should generate proper URL params", () => {
      const questionId = 109;

      expect(getQuestionParameters(questionId)).toEqual({
        location: {
          query: {},
          hash: "",
          pathname: "/question/109",
        },
        params: { slug: "109" },
      });
    });
  });
});
