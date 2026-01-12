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
import { reinitialize } from "metabase/plugins";
import type { CardId, CollectionType, TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaticQuestion } from "./StaticQuestion";

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

interface SetupOpts {
  title?: string | boolean;
  withChartTypeSelector?: boolean;
  withDownloads?: boolean;
  withAlerts?: boolean;
  isEmailSetup?: boolean;
  canManageSubscriptions?: boolean;
  isSuperuser?: boolean;
  isModel?: boolean;
  collectionType?: CollectionType;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  children?: React.ReactNode;
}

const setup = async ({
  title,
  withChartTypeSelector,
  withDownloads,
  withAlerts,
  isEmailSetup = true,
  canManageSubscriptions = true,
  isSuperuser = true,
  isModel = false,
  collectionType,
  tokenFeatures,
  enterprisePlugins,
  children,
}: SetupOpts = {}) => {
  setupNotificationChannelsEndpoints({
    email: { configured: isEmailSetup },
  } as any);

  const user = createMockUser({
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
    }),
  );
  setupAlertsEndpoints(card, []);
  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);
  setupCardQueryEndpoints(card, TEST_DATASET);

  setupCollectionByIdEndpoint({
    collections: [TEST_COLLECTION],
  });

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

describe("StaticQuestion", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should render a static question with the mocked data", async () => {
    await setup();

    expect(screen.getByTestId("query-visualization-root")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-root")).getByText(
        TEST_COLUMN.display_name,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  describe("hide the toolbar and their nested containers when their underlying children are hidden", () => {
    it("should hide the TopBar when no UI elements are provided", async () => {
      await setup({
        title: false,
        withChartTypeSelector: false,
        withDownloads: false,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeInTheDocument();
      expect(topBar).toHaveStyle({ display: "none" });
    });

    it("should show the TopBar when title is provided", async () => {
      await setup({
        title: "My Custom Title",
        withChartTypeSelector: false,
        withDownloads: false,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeInTheDocument();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(screen.getByText("My Custom Title")).toBeInTheDocument();
    });

    it("should show the TopBar when withChartTypeSelector is true", async () => {
      await setup({
        title: false,
        withChartTypeSelector: true,
        withDownloads: false,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeInTheDocument();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(
        screen.getByTestId("chart-type-selector-button"),
      ).toBeInTheDocument();
    });

    it("should show the TopBar when withDownloads is true", async () => {
      await setup({
        title: false,
        withChartTypeSelector: false,
        withDownloads: true,
        withAlerts: false,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeInTheDocument();
      expect(topBar).not.toHaveStyle({ display: "none" });
    });

    describe("alerts button with different Metabase version configurations", () => {
      beforeEach(() => {
        reinitialize();
      });

      describe("OSS (Open Source Software)", () => {
        it("should not show the alert button in OSS regardless of settings", async () => {
          // Don't setup enterprise plugin for OSS
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            isModel: false,
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });
      });

      describe("EE (Enterprise Edition) without embedding_sdk token feature", () => {
        it("should not show the alert button when plugin is enabled but token feature is missing", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            isModel: false,
            enterprisePlugins: ["sdk_notifications"],
            tokenFeatures: {}, // No embedding_sdk feature
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });
      });

      describe("EE with embedding_sdk token feature", () => {
        it("should show the alert button when plugin and token feature are both enabled", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            isModel: false,
            enterprisePlugins: ["sdk_notifications"],
          });

          expect(
            screen.getByRole("button", { name: "Alerts" }),
          ).toBeInTheDocument();
        });

        it("should show the alert button for custom layouts", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            isModel: false,
            enterprisePlugins: ["sdk_notifications"],
            children: (
              <div>
                <span>Custom Layout</span>
                <StaticQuestion.AlertsButton />
              </div>
            ),
          });

          expect(screen.getByText("Custom Layout")).toBeInTheDocument();
          expect(
            screen.getByRole("button", { name: "Alerts" }),
          ).toBeInTheDocument();
        });

        it("should not show the alert button when withAlerts is false", async () => {
          await setup({
            withAlerts: false,
            isEmailSetup: true,
            canManageSubscriptions: true,
            enterprisePlugins: ["sdk_notifications"],
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });

        it("should not show the alert button when email is not configured", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: false,
            canManageSubscriptions: true,
            enterprisePlugins: ["sdk_notifications"],
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });

        it("should not show the alert button when user cannot manage subscriptions and is not admin", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            isSuperuser: false,
            canManageSubscriptions: false,
            enterprisePlugins: ["sdk_notifications", "application_permissions"],
            tokenFeatures: { embedding_sdk: true, advanced_permissions: true },
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });

        it("should not show the alert button for models", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            isModel: true,
            enterprisePlugins: ["sdk_notifications"],
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });

        it("should not show the alert button for analytics collection", async () => {
          await setup({
            withAlerts: true,
            isEmailSetup: true,
            canManageSubscriptions: true,
            collectionType: "instance-analytics",
            enterprisePlugins: ["sdk_notifications"],
          });

          expect(
            screen.queryByRole("button", { name: "Alerts" }),
          ).not.toBeInTheDocument();
        });
      });
    });

    it("should show the TopBar when multiple UI elements are provided", async () => {
      await setup({
        title: "My Title",
        withChartTypeSelector: true,
        withDownloads: true,
        withAlerts: true,
      });

      const topBar = screen.getByTestId("static-question-top-bar");

      expect(topBar).toBeInTheDocument();
      expect(topBar).not.toHaveStyle({ display: "none" });
      expect(screen.getByText("My Title")).toBeInTheDocument();
      expect(
        screen.getByTestId("chart-type-selector-button"),
      ).toBeInTheDocument();
    });
  });
});
