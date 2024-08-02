import userEvent from "@testing-library/user-event";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardQueryEndpoints,
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockJwtConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
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

const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [TEST_COLUMN],
    rows: [["Test Row"]],
  }),
});

const setup = ({
  isOpen = true,
}: {
  isOpen?: boolean;
} = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  const TEST_CARD = createMockCard({
    can_delete: true,
    enable_embedding: true,
  });

  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({
      databases: [TEST_DB],
      tables: [TEST_TABLE], // to be editable, card must have table and database metadata
    }),
  );

  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DB);

  setupTableEndpoints(TEST_TABLE);

  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  const clickSpy = jest.fn();

  renderWithProviders(
    <InteractiveQuestion questionId={TEST_CARD.id}>
      <div>Look! A Button! 👇</div>
      <InteractiveQuestion.NotebookButton onClick={clickSpy} isOpen={isOpen} />
    </InteractiveQuestion>,
    {
      mode: "sdk",
      sdkProviderProps: {
        config: createMockJwtConfig({
          jwtProviderUri: "http://TEST_URI/sso/metabase",
        }),
      },
      storeInitialState: state,
    },
  );

  return { clickSpy };
};

describe("InteractiveQuestion.NotebookButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the notebook button", async () => {
    const shouldRenderSpy = jest.spyOn(QuestionNotebookButton, "shouldRender");

    setup({ isOpen: true });

    expect(await screen.findByTestId("notebook-button")).toBeInTheDocument();
    expect(shouldRenderSpy).toHaveBeenCalledTimes(1);
  });

  it("should fire click handler when clicking the notebook button", async () => {
    const shouldRenderSpy = jest.spyOn(QuestionNotebookButton, "shouldRender");
    const { clickSpy } = setup({ isOpen: true });

    await userEvent.click(await screen.findByTestId("notebook-button"));
    expect(shouldRenderSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
