import userEvent from "@testing-library/user-event";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupDatabaseListEndpoint,
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupNotificationChannelsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import {
  setupCreateNotificationEndpoint,
  setupListNotificationEndpoints,
} from "__support__/server-mocks/notification";
import {
  mockGetBoundingClientRect,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { addAlertModalTests } from "embedding-sdk-bundle/components/public/question/shared-tests/alert-modal.spec";
import { addAlertsButtonTests } from "embedding-sdk-bundle/components/public/question/shared-tests/alerts-button.spec";
import type { SetupOpts } from "embedding-sdk-bundle/components/public/question/shared-tests/constants.spec";
import {
  TEST_COLUMN,
  TEST_DATASET,
  TEST_DB,
  TEST_TABLE,
} from "embedding-sdk-bundle/components/public/question/shared-tests/constants.spec";
import { addQueryPropTests } from "embedding-sdk-bundle/components/public/question/shared-tests/query-prop.spec";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import type { EmbeddingDataPicker } from "metabase/redux/store/embedding-data-picker";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  InteractiveQuestion,
  InteractiveQuestionInternal,
} from "./InteractiveQuestion";

const TEST_CARD_ID = 1;
const USER_ID = 999;

const setup = async ({
  title,
  withChartTypeSelector,
  withDownloads,
  withAlerts,
  isEmailSetup = true,
  canManageSubscriptions = true,
  isSuperuser = true,
  isModel = false,
  notifications = [],
  collectionType,
  tokenFeatures,
  enterprisePlugins,
  children,
}: SetupOpts = {}) => {
  setupNotificationChannelsEndpoints({
    email: { configured: isEmailSetup },
  });

  const user = createMockUser({
    id: USER_ID,
    is_superuser: isSuperuser,
  });

  const { state } = setupSdkState({
    currentUser: {
      ...user,
      permissions: {
        can_access_subscription: canManageSubscriptions,
      },
    },
    tokenFeatures: tokenFeatures
      ? createMockTokenFeatures(tokenFeatures)
      : undefined,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const COLLECTION_ID = 1;
  const TEST_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: null,
    id: COLLECTION_ID,
    location: "/",
    name: "Test collection",
    personal_owner_id: 100,
    type: collectionType,
  });

  const cardType = isModel ? "model" : "question";
  const card = createMockCard({
    id: TEST_CARD_ID,
    name: "My Question",
    type: cardType,
    collection_id: COLLECTION_ID,
    collection: TEST_COLLECTION,
  });

  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({
      databases: [TEST_DB],
      tables: [TEST_TABLE],
    }),
  );
  setupAlertsEndpoints(card, []);
  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);
  setupCardQueryEndpoints(card, TEST_DATASET);

  setupCollectionByIdEndpoint({
    collections: [TEST_COLLECTION],
  });

  setupListNotificationEndpoints({ card_id: card.id }, notifications);
  /**
   * We don't care about these endpoints' results.
   * We only want to avoid getting fetch-mock's unmocked endpoints error.
   */
  setupUserRecipientsEndpoint({ users: [] });
  setupWebhookChannelsEndpoint();
  setupCreateNotificationEndpoint();

  /**
   * These endpoints are used in query editor, we don't care about their values,
   * we just need to mock them to not fail fetch-mock's unmocked responses error.
   */
  setupSearchEndpoints([]);
  setupDatabaseListEndpoint([]);

  renderWithSDKProviders(
    <InteractiveQuestion
      questionId={TEST_CARD_ID}
      title={title}
      withChartTypeSelector={withChartTypeSelector}
      withDownloads={withDownloads}
      withAlerts={withAlerts}
    >
      {children}
    </InteractiveQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();
};

addQueryPropTests({ Component: InteractiveQuestionInternal });

describe("InteractiveQuestion", () => {
  addAlertsButtonTests(setup, {
    customComponent: InteractiveQuestion.AlertsButton,
  });
  addAlertModalTests(setup, { userId: USER_ID });

  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should render an interactive question with the mocked data", async () => {
    await setup();

    expect(screen.getByTestId("query-visualization-root")).toBeVisible();
    expect(
      within(screen.getByTestId("table-root")).getByText(
        TEST_COLUMN.display_name,
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeVisible();
  });

  describe("toolbar visibility", () => {
    it("should hide the chart type selector when it is disabled", async () => {
      await setup({
        withChartTypeSelector: false,
      });

      expect(
        screen.queryByTestId("chart-type-selector-button"),
      ).not.toBeInTheDocument();
    });

    it("should show the chart type selector when it is enabled", async () => {
      await setup({
        withChartTypeSelector: true,
      });

      expect(screen.getByTestId("chart-type-selector-button")).toBeVisible();
    });

    it("should show the download widget when downloads are enabled", async () => {
      await setup({
        withDownloads: true,
      });

      expect(
        screen.getByRole("button", { name: "Download results" }),
      ).toBeVisible();
    });

    it("should not show the download widget when downloads are disabled", async () => {
      await setup({
        withDownloads: false,
      });

      expect(
        screen.queryByRole("button", { name: "Download results" }),
      ).not.toBeInTheDocument();
    });
  });

  it("should not show alerts and downloads buttons when editing the question", async () => {
    await setup({
      withDownloads: true,
      withAlerts: true,
      isEmailSetup: true,
      canManageSubscriptions: true,
      enterprisePlugins: ["sdk_notifications"],
    });

    // Both buttons are visible in view mode
    expect(screen.queryByRole("button", { name: "Alerts" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Download results" }),
    ).toBeVisible();

    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit question" }),
    );

    // This button only shows on edit mode
    expect(screen.queryByRole("button", { name: "Back" })).toBeVisible();
    // Both buttons are hidden in edit mode
    expect(
      screen.queryByRole("button", { name: "Alerts" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download results" }),
    ).not.toBeInTheDocument();
  });
});

describe('questionId: "new"', () => {
  interface SetupOpts {
    questionId: SdkQuestionId;
    dataPicker?: EmbeddingDataPicker;
  }

  async function setup({ questionId, dataPicker }: SetupOpts) {
    setupDatabasesEndpoints([TEST_DB]);
    setupCollectionByIdEndpoint({
      collections: [createMockCollection({ id: 1 })],
    });
    setupEmbeddingDataPickerDecisionEndpoints("flat");
    setupSearchEndpoints([
      createMockModelResult({
        id: 1,
        name: "Orders model",
      }),
    ]);

    renderWithSDKProviders(
      <InteractiveQuestion questionId={questionId} dataPicker={dataPicker} />,
      {
        componentProviderProps: {
          authConfig: createMockSdkConfig(),
        },
      },
    );

    await waitForLoaderToBeRemoved();
  }

  function findDataPickerPopover() {
    return screen.findByRole("dialog", { name: "Pick your starting data" });
  }

  beforeEach(() => {
    setupEnterprisePlugins();
  });

  it("should render simple data picker the query editor", async () => {
    await setup({ questionId: "new" });

    expect(
      await screen.findByRole("button", { name: "Pick your starting data" }),
    ).toBeVisible();

    expect(
      within(await findDataPickerPopover()).getByRole("link", {
        name: "Orders model",
      }),
    ).toBeVisible();
  });

  it(`should render staged data picker the query editor when passing dataPicker="staged"`, async () => {
    await setup({ questionId: "new", dataPicker: "staged" });

    expect(
      await screen.findByRole("button", { name: "Pick your starting data" }),
    ).toBeVisible();

    const withinPopover = within(await findDataPickerPopover());
    expect(
      withinPopover.queryByRole("link", {
        name: "Orders model",
      }),
    ).not.toBeInTheDocument();
    expect(withinPopover.getByText("Raw Data")).toBeVisible();
    expect(withinPopover.getByText("Models")).toBeVisible();
  });
});
