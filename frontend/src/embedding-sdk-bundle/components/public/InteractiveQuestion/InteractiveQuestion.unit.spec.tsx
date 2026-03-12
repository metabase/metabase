import userEvent from "@testing-library/user-event";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  findRequests,
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
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import { createMockModelResult } from "metabase/browse/models/test-utils";
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
import { createMockNotification } from "metabase-types/api/mocks/notification";
import type { EmbeddingDataPicker } from "metabase-types/store/embedding-data-picker";

import { InteractiveQuestion } from "./InteractiveQuestion";

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

const USER_ID = 999;

interface SetupOpts {
  title?: string | boolean;
  withChartTypeSelector?: boolean;
  withDownloads?: boolean;
  withAlerts?: boolean;
  isEmailSetup?: boolean;
  canManageSubscriptions?: boolean;
  isSuperuser?: boolean;
  isModel?: boolean;
  notifications?: ReturnType<typeof createMockNotification>[];
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
  notifications = [],
  collectionType,
  tokenFeatures,
  enterprisePlugins,
  children,
}: SetupOpts = {}) => {
  setupNotificationChannelsEndpoints({
    email: { configured: isEmailSetup },
  } as any);

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

describe("InteractiveQuestion", () => {
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

  describe("alerts button with different Metabase version configurations", () => {
    beforeEach(() => {
      reinitialize();
    });

    // eslint-disable-next-line jest/no-disabled-tests -- Fix this in EMB-1184, when we can test SDK with API keys
    describe.skip("OSS (Open Source Software)", () => {
      it("should not show the alert button in OSS regardless of settings", async () => {
        // Don't setup enterprise plugin for OSS
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          tokenFeatures: {}, // No embedding_sdk feature
        });

        expect(
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests -- Fix this in EMB-1184, when we can test SDK with API keys
    describe.skip("EE (Enterprise Edition) without embedding_sdk token feature", () => {
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
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
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
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
        expect(screen.getByRole("button", { name: "Alerts" })).toBeVisible();
      });

      it("should show the alert button for custom layouts when withAlerts is true", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
          children: (
            <div>
              <span>Custom Layout</span>
              <InteractiveQuestion.AlertsButton />
            </div>
          ),
        });

        expect(screen.getByText("Custom Layout")).toBeVisible();
        expect(screen.getByRole("button", { name: "Alerts" })).toBeVisible();
      });

      it("should not show the alert button for custom layouts when withAlerts is false", async () => {
        await setup({
          withAlerts: false,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
          children: (
            <div>
              <span>Custom Layout</span>
              <InteractiveQuestion.AlertsButton />
            </div>
          ),
        });

        expect(screen.getByText("Custom Layout")).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
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

  describe("alert modal", () => {
    it("should show alert list modal when there are existing alerts", async () => {
      await setup({
        withAlerts: true,
        isEmailSetup: true,
        canManageSubscriptions: true,
        isModel: false,
        enterprisePlugins: ["sdk_notifications"],
        notifications: [createMockNotification()],
      });

      expect(
        within(screen.getByRole("gridcell")).getByText("Test Row"),
      ).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Alerts" }));

      // Verify the alert list modal appears, not the create modal
      const withinModal = within(await findModal());

      // Show the alert list modal title
      expect(
        await withinModal.findByRole("heading", { name: "Edit alerts" }),
      ).toBeVisible();

      // Should show the button to create a new alert in the list modal
      expect(withinModal.getByText("New alert")).toBeVisible();

      // Should NOT show the create alert form fields
      expect(
        withinModal.queryByText("What do you want to be alerted about?"),
      ).not.toBeInTheDocument();
    });

    it("should not show email selector on the SDK and use current logged in user as the recipient", async () => {
      await setup({
        withAlerts: true,
        isEmailSetup: true,
        canManageSubscriptions: true,
        isModel: false,
        enterprisePlugins: ["sdk_notifications"],
      });

      expect(
        within(screen.getByRole("gridcell")).getByText("Test Row"),
      ).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Alerts" }));

      const withinModal = within(await findModal());
      expect(
        withinModal.getByRole("heading", { name: "New alert" }),
      ).toBeVisible();
      expect(
        withinModal.getByText("What do you want to be alerted about?"),
      ).toBeVisible();
      expect(
        withinModal.getByText("When do you want to check this?"),
      ).toBeVisible();
      // Email selector is within this section, checking only the header is fine
      expect(
        withinModal.queryByText("Where do you want to send the results?"),
      ).not.toBeInTheDocument();
      expect(withinModal.getByText("More options")).toBeVisible();
      await userEvent.click(withinModal.getByRole("button", { name: "Done" }));

      const createNotificationRequest = (await findRequests("POST")).find(
        (postRequest) =>
          postRequest.url === "http://localhost/api/notification",
      );
      // Checks that we're using the current logged in user as the sole recipient
      expect(createNotificationRequest?.body).toMatchObject({
        handlers: [
          {
            channel_type: "channel/email",
            recipients: [
              {
                details: null,
                type: "notification-recipient/user",
                user_id: USER_ID,
              },
            ],
          },
        ],
      });
      // So that when we assert this value, we know we won't accidentally match the default mock ID
      expect(USER_ID).not.toBe(1);
    });
  });
});

async function findModal() {
  return await screen.findByRole("dialog");
}

describe('questionId: "new"', () => {
  interface SetupOpts {
    questionId?: SdkQuestionId;
    dataPicker?: EmbeddingDataPicker;
  }

  async function setup({ questionId, dataPicker }: SetupOpts = {}) {
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
