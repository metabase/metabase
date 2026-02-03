import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAlertsEndpoints,
  setupCardByEntityIdEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import { setupEntityIdEndpoint } from "__support__/server-mocks/entity-id";
import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import {
  SdkQuestionDefaultView,
  type SdkQuestionDefaultViewProps,
} from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkQuestionTitleProps } from "embedding-sdk-bundle/types/question";
import type { BaseEntityId, CardId } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { useSdkQuestionContext } from "../../private/SdkQuestion/context";

import { type BaseSdkQuestionProps, SdkQuestion } from "./SdkQuestion";
const TEST_PARAM = createMockParameter({
  type: "number/=",
  slug: "product_id",
  target: ["variable", ["template-tag", "product_id"]],
});

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

const VISUALIZATION_TYPES = ["Table", "Number", "Gauge", "Detail", "Progress"];

// Provides a button to re-run the query
function InteractiveQuestionCustomLayout({
  title,
}: {
  title?: SdkQuestionTitleProps;
}) {
  const { resetQuestion } = useSdkQuestionContext();

  return (
    <div>
      <button onClick={resetQuestion}>Run Query</button>
      <SdkQuestionDefaultView title={title} />
    </div>
  );
}

const TEST_CARD_ID: CardId = 1 as const;
const TEST_ENTITY_ID = createMockEntityId();
const TEST_CARD = createMockCard({
  name: "My Question",
  parameters: [TEST_PARAM],
});

const setup = async ({
  isValidCard = true,
  title,
  withCustomLayout = false,
  withChartTypeSelector = false,
  initialSqlParameters,
  cardId = TEST_CARD_ID,
  preventWaitForLoader = false,
}: Partial<
  Pick<BaseSdkQuestionProps, "initialSqlParameters"> &
    Pick<SdkQuestionDefaultViewProps, "withChartTypeSelector" | "title"> & {
      isValidCard?: boolean;
      withCustomLayout?: boolean;
    } & { cardId: BaseEntityId | CardId; preventWaitForLoader?: boolean }
> = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  if (isValidCard) {
    setupCardEndpoints(TEST_CARD);
    setupCardQueryMetadataEndpoint(
      TEST_CARD,
      createMockCardQueryMetadata({
        databases: [TEST_DB],
      }),
    );
  } else {
    setupUnauthorizedCardEndpoints(TEST_CARD);
  }
  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DB);

  setupTableEndpoints(TEST_TABLE);

  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  setupEntityIdEndpoint({ card: { [TEST_ENTITY_ID]: TEST_CARD_ID } });

  const BOBBY_TEST_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: null,
    id: 1,
    location: "/",
    name: "Bobby Tables's Personal Collection",
    personal_owner_id: 100,
  });

  setupCollectionByIdEndpoint({
    collections: [BOBBY_TEST_COLLECTION],
  });

  renderWithSDKProviders(
    <SdkQuestion
      questionId={cardId}
      title={title}
      withChartTypeSelector={withChartTypeSelector}
      initialSqlParameters={initialSqlParameters}
    >
      {withCustomLayout ? <InteractiveQuestionCustomLayout /> : undefined}
    </SdkQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  if (!preventWaitForLoader) {
    await waitForLoaderToBeRemoved();
  }
};

describe("InteractiveQuestion", () => {
  it("should initially render with a loader", async () => {
    await setup({ preventWaitForLoader: true });
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  describe("table visualization", () => {
    beforeAll(() => {
      mockGetBoundingClientRect();
    });

    it("should render loading state when rerunning the query", async () => {
      await setup({ withCustomLayout: true });

      expect(
        await within(screen.getByTestId("table-root")).findByText(
          TEST_COLUMN.display_name,
        ),
      ).toBeInTheDocument();
      expect(
        await within(screen.getByRole("gridcell")).findByText("Test Row"),
      ).toBeInTheDocument();

      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      // Simulate drilling down by re-running the query again
      act(() => screen.getByText("Run Query").click());

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(
        within(await screen.findByRole("gridcell")).getByText("Test Row"),
      ).toBeInTheDocument();
    });
  });

  it("should render when question is valid", async () => {
    await setup();

    expect(
      within(screen.getByTestId("table-root")).getByText(
        TEST_COLUMN.display_name,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  it("should not render an error if a question isn't found before the question loaded", async () => {
    await setup();

    expect(screen.queryByText("Error")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should render an error if a question isn't found", async () => {
    await setup({ isValidCard: false });

    expect(screen.getByRole("alert")).toHaveTextContent(
      `Question ${TEST_CARD.id} not found. Make sure you pass the correct ID.`,
    );
  });

  it.each([
    // shows the question title by default
    [undefined, "My Question"],

    // hides the question title when title={false}
    [false, null],

    // shows the default question title when title={true}
    [true, "My Question"],

    // customizes the question title via strings
    ["Foo Bar", "Foo Bar"],

    // customizes the question title via React elements
    [<h1 key="foo">Foo Bar</h1>, "Foo Bar"],

    // customizes the question title via React components.
    [() => <h1>Foo Bar</h1>, "Foo Bar"],
  ])(
    "shows the question title according to the title prop",
    async (titleProp, expectedTitle) => {
      await setup({ title: titleProp });

      const element = screen.queryByText(expectedTitle ?? "My Question");
      expect(element?.textContent ?? null).toBe(expectedTitle);
    },
  );

  it("should show a chart type selector button if withChartTypeSelector is true", async () => {
    await setup({ withChartTypeSelector: true });

    expect(
      screen.getByTestId("chart-type-selector-button"),
    ).toBeInTheDocument();
  });

  it("should not show a chart type selector button if withChartTypeSelector is false", async () => {
    await setup({ withChartTypeSelector: false });

    expect(
      screen.queryByTestId("chart-type-selector-button"),
    ).not.toBeInTheDocument();
  });

  it("should change the visualization if a different visualization is selected", async () => {
    await setup({ withChartTypeSelector: true });
    expect(
      screen.getByTestId("chart-type-selector-button"),
    ).toBeInTheDocument();

    for (const visType of VISUALIZATION_TYPES) {
      await userEvent.click(screen.getByTestId("chart-type-selector-button"));
      await userEvent.click(
        await within(screen.getByRole("menu")).findByText(visType),
      );
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("chart-type-selector-button")).getByText(
          visType,
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId("visualization-root")).toHaveAttribute(
        "data-viz-ui-name",
        visType,
      );
    }
  });

  // Obviously, we can't test every single permutation of chart settings right now, but tests in the core
  // app should cover most cases anyway.
  it("should allow user to use chart settings", async () => {
    await setup({ withChartTypeSelector: true });

    await userEvent.click(screen.getByLabelText("gear icon"));

    const popover = within(screen.getByRole("dialog"));
    expect(popover.getByTestId("chartsettings-sidebar")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("Test Column-settings-button"));

    const columnTitle = screen.getByTestId("column_title");
    await userEvent.clear(columnTitle);
    await userEvent.paste("A New Test Column");

    expect(
      await screen.findByTestId("draggable-item-A New Test Column"),
    ).toBeInTheDocument();
  });

  it("should query with the parameters in a parameterized question", async () => {
    await setup({ initialSqlParameters: { product_id: 1024 } });

    const lastQuery = fetchMock.callHistory.lastCall(
      `path:/api/card/${TEST_CARD.id}/query`,
    );
    const queryRequest = await lastQuery?.request?.json();

    expect(queryRequest.parameters?.[0]).toMatchObject({
      id: TEST_PARAM.id,
      type: TEST_PARAM.type,
      target: TEST_PARAM.target,
      value: [1024],
    });
  });

  it("should not flash an error when loading with an entity ID (metabase#57059)", async () => {
    setupCardByEntityIdEndpoints({ ...TEST_CARD, entity_id: TEST_ENTITY_ID });
    await setup({ cardId: TEST_ENTITY_ID });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Query results will appear here."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("query-visualization-root")).toBeInTheDocument();
  });
});
