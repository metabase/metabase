import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
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
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaticQuestion, StaticQuestionInternal } from "./StaticQuestion";

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

  renderWithSDKProviders(
    <StaticQuestion
      questionId={TEST_CARD_ID}
      title={title}
      withChartTypeSelector={withChartTypeSelector}
      withDownloads={withDownloads}
      withAlerts={withAlerts}
    >
      {children}
    </StaticQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();
};

addQueryPropTests({ Component: StaticQuestionInternal });

describe("StaticQuestion", () => {
  addAlertsButtonTests(setup, { customComponent: StaticQuestion.AlertsButton });
  addAlertModalTests(setup, { userId: USER_ID });

  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should render a static question with the mocked data", async () => {
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
    it("should hide the TopBar when no UI elements are provided", async () => {
      await setup({
        title: false,
        withChartTypeSelector: false,
        withDownloads: false,
        withAlerts: false,
      });

      expect(
        screen.queryByTestId("static-question-top-bar"),
      ).not.toBeInTheDocument();
    });

    it("should show the TopBar when title is provided", async () => {
      await setup({
        title: "My Custom Title",
        withChartTypeSelector: false,
        withDownloads: false,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeVisible();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(screen.getByText("My Custom Title")).toBeVisible();
    });

    it("should show the TopBar when withChartTypeSelector is true", async () => {
      await setup({
        title: false,
        withChartTypeSelector: true,
        withDownloads: false,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeVisible();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(screen.getByTestId("chart-type-selector-button")).toBeVisible();
    });

    it("should show the TopBar when withDownloads is true", async () => {
      await setup({
        title: false,
        withChartTypeSelector: false,
        withDownloads: true,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeVisible();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(
        screen.getByRole("button", { name: "Download results" }),
      ).toBeVisible();
    });

    it("should show the TopBar when multiple UI elements are provided", async () => {
      await setup({
        title: "My Title",
        withChartTypeSelector: true,
        withDownloads: true,
        withAlerts: true,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeVisible();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(screen.getByText("My Title")).toBeVisible();
      expect(screen.getByTestId("chart-type-selector-button")).toBeVisible();
    });
  });
});
