import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import {
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupNotificationChannelsEndpoints,
  setupParameterValuesEndpoints,
  setupPublicLinkRefusalEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { expectNoBadSchemaEvents } from "__support__/snowplow";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import type * as Analytics from "metabase/analytics";
import { DashboardSharingMenu } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardSharingMenu/DashboardSharingMenu";
import { reinitialize } from "metabase/plugins";
import { QuestionSharingMenu } from "metabase/query_builder/components/view/ViewHeader/components/ViewTitleHeaderRightSide/QuestionSharingMenu/QuestionSharingMenu";
import { useGetSettingsQuery } from "metabase/settings";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dashboard,
  EmbeddingParameters,
  EmbeddingType,
  EnterpriseSettings,
  Parameter,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockParameter,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbedSetupModals } from "../EmbedSetupModals";

// Usage analytics of the embed.js host page, reported a second after an embed
// mounts, when the preview may already be gone.
jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSchemaEvent, trackSimpleEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

type ResourceType = "dashboard" | "question";

// The app keeps this subscription open (see `AppComponent`), so that saving a
// setting refetches the settings. Without a subscriber RTK Query does not refetch.
function AppSettingsSubscription() {
  useGetSettingsQuery();
  return null;
}

// Not the ids the mock factories default to, so a hard-coded id cannot pass.
const DASHBOARD_ID = 7;
const CARD_ID = 8;

const NOW = new Date("2026-03-01T10:00:00Z").getTime();
const HOUR_MS = 60 * 60 * 1000;

const PARAMETERS: Parameter[] = [
  createMockParameter({
    id: "1",
    name: "Created At",
    slug: "created_at",
    type: "date/month-year",
  }),
  createMockParameter({
    id: "2",
    name: "Price",
    slug: "price",
    type: "number/=",
  }),
  createMockParameter({
    id: "3",
    name: "Category",
    slug: "category",
    type: "string/contains",
  }),
];

type ResourceState = {
  enable_embedding: boolean;
  embedding_params: EmbeddingParameters | null;
  embedding_type: EmbeddingType | null;
  initially_published_at: string | null;
};

function isEmbeddingParameters(value: unknown): value is EmbeddingParameters {
  return (
    typeof value === "object" &&
    value != null &&
    Object.values(value).every(
      (visibility) =>
        visibility === "disabled" ||
        visibility === "enabled" ||
        visibility === "locked",
    )
  );
}

type SetupOpts = {
  resourceType: ResourceType;
  isPro?: boolean;
  settings?: Partial<EnterpriseSettings>;
  resource?: Partial<ResourceState>;
};

function setup({
  resourceType,
  isPro = false,
  settings: settingOverrides = {},
  resource: resourceOverrides = {},
}: SetupOpts) {
  const database = createMockDatabase();

  // The stored resource, changed only by the PUT handlers below, the way the
  // backend would change it.
  const stored: ResourceState = {
    enable_embedding: false,
    embedding_params: null,
    embedding_type: null,
    initially_published_at: null,
    ...resourceOverrides,
  };
  const dashboard = (): Dashboard =>
    createMockDashboard({
      id: DASHBOARD_ID,
      name: "Embeddable dashboard",
      parameters: PARAMETERS,
      dashcards: [createMockDashboardCard({ dashboard_id: DASHBOARD_ID })],
      created_at: new Date(NOW).toISOString(),
      ...stored,
    });
  const card = (): Card =>
    createMockCard({
      id: CARD_ID,
      name: "Embeddable question",
      parameters: PARAMETERS,
      created_at: new Date(NOW).toISOString(),
      ...stored,
    });
  const getStoredResource = () =>
    resourceType === "dashboard" ? dashboard() : card();
  const apiPath =
    resourceType === "dashboard"
      ? `/api/dashboard/${DASHBOARD_ID}`
      : `/api/card/${CARD_ID}`;

  fetchMock.get(`path:${apiPath}`, () => getStoredResource(), {
    name: "get-resource",
  });
  fetchMock.put(
    `path:${apiPath}`,
    async ({ options }) => {
      const body: unknown = JSON.parse(String(options.body));
      if (typeof body === "object" && body != null) {
        if ("enable_embedding" in body) {
          stored.enable_embedding = body.enable_embedding === true;
          if (stored.enable_embedding && !stored.initially_published_at) {
            stored.initially_published_at = new Date(Date.now()).toISOString();
          }
        }
        if (
          "embedding_params" in body &&
          isEmbeddingParameters(body.embedding_params)
        ) {
          stored.embedding_params = body.embedding_params;
        }
        if ("embedding_type" in body) {
          stored.embedding_type =
            body.embedding_type === "guest-embed" ||
            body.embedding_type === "static-legacy"
              ? body.embedding_type
              : null;
        }
      }
      return getStoredResource();
    },
    { name: "put-resource" },
  );
  setupDashboardQueryMetadataEndpoint(
    dashboard(),
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupCardQueryMetadataEndpoint(
    card(),
    createMockCardQueryMetadata({ databases: [database] }),
  );
  fetchMock.get(`path:/api/card/${CARD_ID}/series`, []);
  setupPublicLinkRefusalEndpoint(
    resourceType === "dashboard"
      ? { model: "dashboard", id: DASHBOARD_ID }
      : { model: "card", id: CARD_ID },
  );

  const settings = createMockSettings({
    "enable-public-sharing": false,
    "enable-embedding-modular": true,
    "show-modular-embed-terms": false,
    "show-static-embed-terms": false,
    "embedding-secret-key": "my_super_secret_key",
    "site-url": window.location.origin,
    "token-features": createMockTokenFeatures({ embedding_simple: isPro }),
    "example-dashboard-id": null,
    ...settingOverrides,
  });
  fetchMock.get("path:/api/session/properties", () => settings, {
    name: "get-session-properties",
  });
  fetchMock.put("path:/api/setting", async ({ options }) => {
    const body: unknown = JSON.parse(String(options.body));
    if (typeof body === "object" && body != null) {
      Object.assign(settings, body);
    }
    return 204;
  });

  setupUpdateSettingEndpoint();
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupSearchEndpoints([]);
  setupDatabasesEndpoints([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupNotificationChannelsEndpoints({});
  setupParameterValuesEndpoints({ values: [], has_more_values: false });
  fetchMock.get("path:/api/embed-theme", []);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(settings),
  });

  // The plugin reads the token features, so it comes after `mockSettings`.
  if (isPro) {
    setupEnterpriseOnlyPlugin("embedding_iframe_sdk_setup");
  }

  renderWithProviders(
    <>
      {resourceType === "dashboard" ? (
        <DashboardSharingMenu dashboard={dashboard()} />
      ) : (
        <QuestionSharingMenu
          question={new Question(card(), createMockMetadata({}))}
        />
      )}
      <EmbedSetupModals />
      <AppSettingsSubscription />
    </>,
    { storeInitialState: state, withRouter: true },
  );

  return {
    // Stands in for a change made outside the app, like a direct API call.
    updateStoredResource: (changes: Partial<ResourceState>) =>
      Object.assign(stored, changes),
  };
}

async function openEmbedFlow() {
  await userEvent.click(screen.getByTestId("sharing-menu-button"));
  await userEvent.click(
    within(await screen.findByTestId("sharing-menu")).getByRole("button", {
      name: "Embed",
    }),
  );
  return screen.findByTestId("sdk-iframe-embed-setup-modal-content");
}

function getPreviewTokenResource(
  preview: HTMLElement,
  resourceType: ResourceType,
): unknown {
  const token = preview
    .querySelector(
      resourceType === "dashboard" ? "metabase-dashboard" : "metabase-question",
    )
    ?.getAttribute("token");
  const payload = token?.split(".")[1];
  if (!payload) {
    return null;
  }
  const claims: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf-8"),
  );
  return typeof claims === "object" && claims != null && "resource" in claims
    ? claims.resource
    : null;
}

function getResourceRequests(method: "GET" | "PUT") {
  return fetchMock.callHistory.calls(
    method === "GET" ? "get-resource" : "put-resource",
  );
}

function getPutBodies() {
  return getResourceRequests("PUT").map(({ options }): unknown =>
    JSON.parse(String(options.body)),
  );
}

async function openLegacyStaticEmbedding() {
  await openEmbedFlow();
  await userEvent.click(
    await screen.findByTestId("legacy-static-embedding-button"),
  );
  expect(await screen.findByText("Static embedding")).toBeVisible();
}

async function setParameterVisibility(
  parameterName: string,
  visibility: "Editable" | "Locked",
) {
  await userEvent.click(screen.getByLabelText(parameterName));
  await userEvent.click(
    within(await screen.findByRole("listbox")).getByText(visibility),
  );
}

async function clickStatusBarButton(name: string, expectedPutCount: number) {
  await userEvent.click(screen.getByRole("button", { name }));
  await waitFor(() =>
    expect(getResourceRequests("PUT")).toHaveLength(expectedPutCount),
  );
  await waitForRequestsToSettle();
}

const STATIC_LEGACY_RESOURCE: Partial<ResourceState> = {
  enable_embedding: true,
  embedding_type: "static-legacy",
  initially_published_at: new Date(NOW).toISOString(),
};

describe("Sharing menu > embed flow", () => {
  beforeEach(() => {
    jest.mocked(trackSchemaEvent).mockClear();
    jest.mocked(trackSimpleEvent).mockClear();
  });

  afterEach(() => {
    reinitialize();
  });

  describe.each<ResourceType>(["dashboard", "question"])(
    "%s",
    (resourceType) => {
      it("lets an admin open the embed flow when public sharing and embedding are disabled", async () => {
        setup({
          resourceType,
          settings: {
            "enable-public-sharing": false,
            "enable-embedding-modular": false,
          },
        });

        await userEvent.click(screen.getByTestId("sharing-menu-button"));
        const menu = await screen.findByTestId("sharing-menu");
        expect(
          within(menu).getByRole("button", { name: "Embed" }),
        ).toBeEnabled();
        expect(
          within(menu).queryByText(/public link/i),
        ).not.toBeInTheDocument();
        expect(within(menu).queryByText("Enable")).not.toBeInTheDocument();

        await userEvent.click(
          within(menu).getByRole("button", { name: "Embed" }),
        );

        expect(
          await screen.findByTestId("sdk-iframe-embed-setup-modal-content"),
        ).toBeVisible();
      });

      it(`pre-selects the ${resourceType} it was opened from`, async () => {
        setup({ resourceType, isPro: true });

        await openEmbedFlow();

        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "embed_wizard_opened",
        });
        expect(await screen.findByText("Behavior")).toBeVisible();
        expect(screen.getByText("Appearance")).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Back" }),
        ).not.toBeInTheDocument();
        // The preview embeds the resource the flow was opened from
        // The guest preview embeds the resource the flow was opened from
        const preview = await screen.findByTestId("iframe-embed-container");
        await waitFor(() =>
          expect(getPreviewTokenResource(preview, resourceType)).toEqual(
            resourceType === "dashboard"
              ? { dashboard: DASHBOARD_ID }
              : { question: CARD_ID },
          ),
        );

        await userEvent.click(screen.getByRole("button", { name: "Get code" }));

        expect(trackSimpleEvent).toHaveBeenLastCalledWith({
          event: "embed_wizard_options_completed",
          event_detail: "settings=default",
        });
      });

      it("shows the legacy static embedding alert for a null embedding type but not for a guest embed", async () => {
        const { updateStoredResource } = setup({
          resourceType,
          resource: { enable_embedding: true, embedding_type: null },
        });

        await openEmbedFlow();
        expect(
          await screen.findByTestId("legacy-static-embedding-button"),
        ).toBeInTheDocument();

        await userEvent.click(
          within(
            screen.getByTestId("sdk-iframe-embed-setup-modal-content"),
          ).getByLabelText("Close"),
        );
        await waitFor(() =>
          expect(
            screen.queryByTestId("sdk-iframe-embed-setup-modal-content"),
          ).not.toBeInTheDocument(),
        );

        updateStoredResource({ embedding_type: "guest-embed" });
        const getCountBeforeReopen = getResourceRequests("GET").length;
        await openEmbedFlow();

        // The flow fetches the resource again instead of using the stale one
        await waitFor(() =>
          expect(getResourceRequests("GET").length).toBeGreaterThan(
            getCountBeforeReopen,
          ),
        );
        await waitForRequestsToSettle();
        expect(await screen.findByText("Behavior")).toBeVisible();
        expect(
          screen.queryByTestId("legacy-static-embedding-button"),
        ).not.toBeInTheDocument();
      });

      describe("legacy static embedding", () => {
        let dateNowSpy: jest.SpyInstance<number, []>;

        beforeEach(() => {
          dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
        });

        afterEach(() => {
          dateNowSpy.mockRestore();
        });

        it("publishes as static-legacy and tracks discarding and unpublishing", async () => {
          setup({ resourceType, resource: STATIC_LEGACY_RESOURCE });
          await openLegacyStaticEmbedding();
          await clickStatusBarButton("Unpublish", 1);

          await userEvent.click(
            screen.getByRole("tab", { name: "Parameters" }),
          );
          await clickStatusBarButton("Publish", 3);

          await setParameterVisibility("Price", "Editable");
          await userEvent.click(
            screen.getByRole("button", { name: "Discard changes" }),
          );
          expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
            event: "static_embed_discarded",
            artifact: resourceType,
          });

          await setParameterVisibility("Price", "Editable");
          await clickStatusBarButton("Publish changes", 4);

          dateNowSpy.mockReturnValue(NOW + HOUR_MS);
          await clickStatusBarButton("Unpublish", 5);
          expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
            event: "static_embed_unpublished",
            artifact: resourceType,
            time_since_creation: 3600,
            time_since_initial_publication: 3600,
          });

          expect(getPutBodies()).toEqual([
            { enable_embedding: false, embedding_type: null },
            { enable_embedding: true, embedding_type: "static-legacy" },
            {
              embedding_params: {
                created_at: "disabled",
                price: "disabled",
                category: "disabled",
              },
              embedding_type: "static-legacy",
            },
            {
              embedding_params: {
                created_at: "disabled",
                price: "enabled",
                category: "disabled",
              },
              embedding_type: "static-legacy",
            },
            { enable_embedding: false, embedding_type: null },
          ]);
          expectNoBadSchemaEvents(
            jest.mocked(trackSchemaEvent).mock.calls,
            "embed_flow",
            "1-0-3",
          );
        });

        it("tracks publishing with the parameter counts and the time since creation and first publication", async () => {
          setup({ resourceType, resource: STATIC_LEGACY_RESOURCE });
          await openLegacyStaticEmbedding();
          await clickStatusBarButton("Unpublish", 1);

          await clickStatusBarButton("Publish", 3);
          expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
            event: "static_embed_published",
            artifact: resourceType,
            new_embed: false,
            time_since_creation: 0,
            time_since_initial_publication: 0,
            params: { disabled: 3, locked: 0, enabled: 0 },
            is_example_dashboard: false,
          });

          await clickStatusBarButton("Unpublish", 4);
          await userEvent.click(
            screen.getByRole("tab", { name: "Parameters" }),
          );
          await setParameterVisibility("Price", "Editable");
          await setParameterVisibility("Category", "Locked");

          dateNowSpy.mockReturnValue(NOW + HOUR_MS);
          await clickStatusBarButton("Publish", 6);
          expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
            event: "static_embed_published",
            artifact: resourceType,
            new_embed: false,
            time_since_creation: 3600,
            time_since_initial_publication: 3600,
            params: { disabled: 1, locked: 1, enabled: 1 },
            is_example_dashboard: false,
          });
          expectNoBadSchemaEvents(
            jest.mocked(trackSchemaEvent).mock.calls,
            "embed_flow",
            "1-0-3",
          );
        });
      });
    },
  );

  describe("Pro instance with no embedding terms accepted (EMB-1884)", () => {
    it("lets Guest embedding proceed after accepting only the Guest terms", async () => {
      jest.mocked(navigator.clipboard.writeText).mockClear();
      setup({
        resourceType: "dashboard",
        isPro: true,
        settings: {
          "enable-embedding-modular": false,
          "show-modular-embed-terms": true,
          // The backend always sends `false` on Pro (`hide-embed-branding?`)
          "show-static-embed-terms": false,
        },
      });

      await openEmbedFlow();
      await userEvent.click(screen.getByLabelText("Guest"));

      // The option cards share a wrapper that is dimmed and not interactive
      // until the selected auth type is ready. Jest stubs CSS modules, so only
      // the opacity, set from the same flag as `pointer-events`, is visible.
      const getOptionCards = () =>
        screen.getByText("Behavior").closest<HTMLElement>("[style*='opacity']");
      expect(getOptionCards()).toHaveStyle({ opacity: "0.5" });

      const enableCard = screen.getByTestId("enable-embedding-card");
      await userEvent.click(within(enableCard).getByRole("button"));

      await waitFor(() =>
        expect(getOptionCards()).toHaveStyle({ opacity: "1" }),
      );
      // Accepted from the Guest option, without switching to SSO. On Pro both
      // auth types share the setting and the modular embedding terms.
      const settingRequests = fetchMock.callHistory.calls("path:/api/setting", {
        method: "PUT",
      });
      expect(
        settingRequests.map(({ options }): unknown =>
          JSON.parse(String(options.body)),
        ),
      ).toEqual([
        { "enable-embedding-modular": true, "show-modular-embed-terms": false },
      ]);
      expect(screen.getByDisplayValue("guest-embed")).toBeChecked();

      await userEvent.click(screen.getByLabelText("Allow downloads"));
      expect(screen.getByLabelText("Allow downloads")).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Get code" }));
      await userEvent.click(await screen.findByText("publish this dashboard"));
      await waitFor(() => expect(getResourceRequests("PUT")).toHaveLength(2));
      expect(getPutBodies()).toEqual([
        { enable_embedding: true, embedding_type: "guest-embed" },
        {
          embedding_params: {
            created_at: "disabled",
            price: "disabled",
            category: "disabled",
          },
          embedding_type: "guest-embed",
        },
      ]);

      const embedCode = await screen.findByTestId("embed-code-snippet");
      await userEvent.click(
        within(checkNotNull(embedCode.parentElement)).getByRole("button", {
          name: /Copy code/,
        }),
      );
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('with-downloads="true"'),
      );
    });
  });

  describe("Pro instance with modular embedding disabled", () => {
    it("asks to enable modular embedding for SSO", async () => {
      setup({
        resourceType: "dashboard",
        isPro: true,
        settings: { "enable-embedding-modular": false },
      });

      await openEmbedFlow();
      await userEvent.click(screen.getByLabelText("Metabase account (SSO)"));

      expect(screen.getByTestId("enable-embedding-card")).toHaveTextContent(
        /modular embedding/,
      );
    });
  });

  describe("OSS instance", () => {
    it("shows the upsell for embedded analytics", async () => {
      setup({ resourceType: "dashboard" });

      await openEmbedFlow();

      const upsell = await screen.findByTestId("upsell-card");
      expect(
        within(upsell).getByText("Get more powerful embedding"),
      ).toBeVisible();
      expect(within(upsell).getByText("Upgrade to Metabase Pro")).toBeVisible();
    });
  });
});
