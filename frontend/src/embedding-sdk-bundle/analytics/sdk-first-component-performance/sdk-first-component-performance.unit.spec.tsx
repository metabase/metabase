import fetchMock from "fetch-mock";
import type { ReactElement } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDashboardNotFoundEndpoint,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupNotFoundCardEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { mockGetBoundingClientRect, screen, waitFor } from "__support__/ui";
import type * as SdkSnowplow from "embedding-sdk-bundle/analytics/snowplow";
import { trackSdkMetaplowEvent } from "embedding-sdk-bundle/analytics/snowplow";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard/InteractiveDashboard/InteractiveDashboard";
import {
  TEST_DASHBOARD_ID,
  setupSdkDashboard,
  tableDashcard,
} from "embedding-sdk-bundle/components/public/dashboard/tests/setup";
import {
  TEST_DATASET,
  TEST_DB,
} from "embedding-sdk-bundle/components/public/question/shared-tests/constants.spec";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { SDK_SCRIPT_ADDED_AT_DATASET_KEY } from "embedding-sdk-shared/constants/analytics";
import { useLocale } from "metabase/common/hooks/use-locale";
import type * as EmbeddingSdkConfig from "metabase/embedding-sdk/config";
import type * as EmbeddingConfig from "metabase/embedding/config";
import { defer } from "metabase/utils/promise";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDataset,
} from "metabase-types/api/mocks";

import {
  resetSdkFirstComponentPerformanceForTests,
  watchSdkPageVisibility,
} from "./event";

// We send the event only on a production React SDK page, each test of that rule turns one of these on
const PRODUCTION_REACT_SDK_PAGE = {
  isLocalhost: false,
  isHostAppInDevMode: false,
  isEmbedPreview: false,
  isEmbeddingEajs: false,
  isDataApp: false,
  isEmbeddingMcpApp: false,
};
const mockPage = { ...PRODUCTION_REACT_SDK_PAGE };

jest.mock("embedding-sdk-bundle/lib/get-is-localhost", () => ({
  getIsLocalhost: () => mockPage.isLocalhost,
}));

jest.mock("embedding-sdk-shared/lib/is-host-app-in-dev-mode", () => ({
  isHostAppInDevMode: () => mockPage.isHostAppInDevMode,
}));

jest.mock("metabase/embedding/config", () => ({
  ...jest.requireActual<typeof EmbeddingConfig>("metabase/embedding/config"),
  isEmbedPreview: () => mockPage.isEmbedPreview,
}));

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual<typeof EmbeddingSdkConfig>(
    "metabase/embedding-sdk/config",
  ),
  isEmbeddingSdk: () => true,
  isEmbeddingEajs: () => mockPage.isEmbeddingEajs,
  isDataApp: () => mockPage.isDataApp,
  isEmbeddingMcpApp: () => mockPage.isEmbeddingMcpApp,
}));

jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  ...jest.requireActual<typeof SdkSnowplow>(
    "embedding-sdk-bundle/analytics/snowplow",
  ),
  trackSdkMetaplowEvent: jest.fn(),
}));

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const TEST_CARD = createMockCard({
  id: 1,
  name: "My Question",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});

const OTHER_CARD = createMockCard({
  ...TEST_CARD,
  id: 2,
  name: "Other Question",
});

// The fields of the event in `one_page.md`, next to the marks
const EVENT_FIELDS = [
  "result",
  "error",
  "component",
  "sdk_version",
  "instance_version",
  "is_hosted",
  "auth_method",
  "sso_method",
  "jwt_provider_uri_passed",
  "client",
  "bundle_mode",
];

const COMPONENT_MARKS = [
  "first_component_render",
  "metadata_end",
  "query_start",
  "query_end",
];

function getPerformanceEvents() {
  return jest
    .mocked(trackSdkMetaplowEvent)
    .mock.calls.flatMap(([name, data]) =>
      name === "embedding_sdk_first_component_performance" ? [data] : [],
    );
}

async function waitForSinglePerformanceEvent() {
  await waitFor(() => expect(getPerformanceEvents()).toHaveLength(1));
  return getPerformanceEvents()[0];
}

function expectMarksInOrder(
  event: Record<string, unknown>,
  markNames: string[],
) {
  const markTimes = markNames
    .map((markName) => event[markName])
    .filter((markTime): markTime is number => typeof markTime === "number");

  expect(markTimes).toHaveLength(markNames.length);
  expect(markTimes).toEqual([...markTimes].sort((a, b) => a - b));
}

type SetupQuestionEndpointsOpts = {
  card?: Card;
  cardQueryResponse?: Dataset | Promise<Dataset>;
};

function setupQuestionEndpoints({
  card = TEST_CARD,
  cardQueryResponse = TEST_DATASET,
}: SetupQuestionEndpointsOpts = {}) {
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );
  setupAlertsEndpoints(card, []);
  setupCardQueryEndpoints(card, cardQueryResponse);
}

function renderSdkComponent(ui: ReactElement) {
  return renderWithSDKProviders(ui, {
    componentProviderProps: { authConfig: createMockSdkConfig() },
    storeInitialState: setupSdkState().state,
  });
}

function waitForCardQueryRequest(card: Card = TEST_CARD) {
  return waitFor(() =>
    expect(
      fetchMock.callHistory.called(`path:/api/card/${card.id}/query`),
    ).toBe(true),
  );
}

describe("embedding_sdk_first_component_performance", () => {
  beforeEach(() => {
    resetSdkFirstComponentPerformanceForTests();
    Object.assign(mockPage, PRODUCTION_REACT_SDK_PAGE);
    jest.mocked(trackSdkMetaplowEvent).mockClear();
    jest
      .mocked(useLocale)
      .mockReturnValue({ locale: "en", isLocaleLoading: false });
    mockGetBoundingClientRect();
  });

  describe("the event", () => {
    it("has the fields of the design doc", async () => {
      setupQuestionEndpoints();

      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

      const event = await waitForSinglePerformanceEvent();
      expect(Object.keys(event)).toEqual(expect.arrayContaining(EVENT_FIELDS));
      expect(event).toMatchObject({ client: "embedding-sdk-react" });
    });
  });

  describe("InteractiveDashboard", () => {
    describe("when every card query has returned", () => {
      it("sends a success event with every mark in order", async () => {
        const tableCardQuery = defer<Dataset>();
        await setupSdkDashboard({
          component: InteractiveDashboard,
          tableCardQueryResponse: tableCardQuery.promise,
        });
        expect(getPerformanceEvents()).toEqual([]);

        tableCardQuery.resolve(createMockDataset());

        const event = await waitForSinglePerformanceEvent();
        expect(event).toMatchObject({
          component: "InteractiveDashboard",
          result: "success",
        });
        expect(event.error).toBeUndefined();
        expectMarksInOrder(event, COMPONENT_MARKS);
      });
    });

    describe("when a card has more than one series", () => {
      it("waits for the last series, even after `onLoad`", async () => {
        const secondSeriesCard = createMockCard({ id: 2, name: "Series 2" });
        const secondSeriesQuery = defer<Dataset>();
        setupDashcardQueryEndpoints(
          TEST_DASHBOARD_ID,
          { ...tableDashcard, card_id: secondSeriesCard.id },
          secondSeriesQuery.promise,
        );
        const onLoad = jest.fn();

        await setupSdkDashboard({
          component: InteractiveDashboard,
          dashcards: [{ ...tableDashcard, series: [secondSeriesCard] }],
          props: { onLoad },
        });

        // We use `onLoad` to know that the first series has returned
        await waitFor(() => expect(onLoad).toHaveBeenCalled());
        expect(getPerformanceEvents()).toEqual([]);

        secondSeriesQuery.resolve(createMockDataset());

        expect(await waitForSinglePerformanceEvent()).toMatchObject({
          result: "success",
        });
      });
    });

    describe("when a card query fails", () => {
      it("sends a success event with error `card_query`, because the rest of the dashboard is on screen", async () => {
        await setupSdkDashboard({
          component: InteractiveDashboard,
          tableCardQueryResponse: createMockDataset({
            error: "The query failed",
          }),
        });

        expect(await waitForSinglePerformanceEvent()).toMatchObject({
          result: "success",
          error: "card_query",
        });
      });
    });

    describe("when the dashboard request fails", () => {
      it("sends a failure event with error `load`", async () => {
        const dashboard = createMockDashboard({ id: TEST_DASHBOARD_ID });
        setupDashboardNotFoundEndpoint(dashboard);
        setupDashboardQueryMetadataEndpoint(
          dashboard,
          createMockDashboardQueryMetadata(),
        );

        renderSdkComponent(
          <InteractiveDashboard dashboardId={TEST_DASHBOARD_ID} />,
        );

        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(await waitForSinglePerformanceEvent()).toMatchObject({
          result: "failure",
          error: "load",
        });
      });
    });
  });

  describe("StaticQuestion", () => {
    describe("when the card query returns", () => {
      it("sends a success event with every mark in order", async () => {
        const cardQuery = defer<Dataset>();
        setupQuestionEndpoints({ cardQueryResponse: cardQuery.promise });

        renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);
        await waitForCardQueryRequest();
        expect(getPerformanceEvents()).toEqual([]);

        cardQuery.resolve(TEST_DATASET);

        const event = await waitForSinglePerformanceEvent();
        expect(event).toMatchObject({
          component: "StaticQuestion",
          result: "success",
        });
        expect(event.error).toBeUndefined();
        expectMarksInOrder(event, COMPONENT_MARKS);
      });
    });

    describe("when the query returns an error", () => {
      it("sends a failure event with error `query`", async () => {
        setupQuestionEndpoints({
          cardQueryResponse: createMockDataset({ error: "The query failed" }),
        });

        renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

        expect(await waitForSinglePerformanceEvent()).toMatchObject({
          result: "failure",
          error: "query",
        });
      });
    });

    describe("when the card request fails", () => {
      it("sends a failure event with error `load`", async () => {
        setupNotFoundCardEndpoints(TEST_CARD.id);

        renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

        expect(await screen.findByRole("alert")).toHaveTextContent("not found");
        expect(await waitForSinglePerformanceEvent()).toMatchObject({
          result: "failure",
          error: "load",
        });
      });
    });
  });

  describe("InteractiveQuestion", () => {
    describe("when the card query returns", () => {
      it("sends a success event with every mark in order", async () => {
        const cardQuery = defer<Dataset>();
        setupQuestionEndpoints({ cardQueryResponse: cardQuery.promise });
        setupCollectionByIdEndpoint({
          collections: [createMockCollection({ id: 1 })],
        });

        renderSdkComponent(<InteractiveQuestion questionId={TEST_CARD.id} />);
        await waitForCardQueryRequest();
        expect(getPerformanceEvents()).toEqual([]);

        cardQuery.resolve(TEST_DATASET);

        const event = await waitForSinglePerformanceEvent();
        expect(event).toMatchObject({
          component: "InteractiveQuestion",
          result: "success",
        });
        expect(event.error).toBeUndefined();
        expectMarksInOrder(event, COMPONENT_MARKS);
      });
    });

    describe("when the question is new", () => {
      it("sends no event, because it runs no query", async () => {
        setupEnterprisePlugins();
        setupDatabasesEndpoints([TEST_DB]);
        setupCollectionByIdEndpoint({
          collections: [createMockCollection({ id: 1 })],
        });
        setupEmbeddingDataPickerDecisionEndpoints("flat");
        setupSearchEndpoints([]);

        renderSdkComponent(<InteractiveQuestion questionId="new" />);

        expect(
          await screen.findByRole("button", {
            name: "Pick your starting data",
          }),
        ).toBeVisible();
        expect(fetchMock.callHistory.called("path:/api/dataset")).toBe(false);
        expect(getPerformanceEvents()).toEqual([]);
      });
    });
  });

  describe("when there is more than one component on the page", () => {
    it("sends the event of the first one, even when another one finishes first", async () => {
      const firstCardQuery = defer<Dataset>();
      setupQuestionEndpoints({
        card: TEST_CARD,
        cardQueryResponse: firstCardQuery.promise,
      });
      setupQuestionEndpoints({ card: OTHER_CARD });

      renderSdkComponent(
        <>
          <StaticQuestion questionId={TEST_CARD.id} />
          <StaticQuestion questionId={OTHER_CARD.id} />
        </>,
      );

      // The second question shows its data first
      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toEqual([]);

      firstCardQuery.resolve(TEST_DATASET);

      expect(await waitForSinglePerformanceEvent()).toMatchObject({
        result: "success",
      });
    });

    it("sends only one event, also when another component loads after it", async () => {
      setupQuestionEndpoints({ card: TEST_CARD });
      setupQuestionEndpoints({ card: OTHER_CARD });

      const { rerender } = renderSdkComponent(
        <StaticQuestion key="first" questionId={TEST_CARD.id} />,
      );
      await waitForSinglePerformanceEvent();

      rerender(<StaticQuestion key="second" questionId={OTHER_CARD.id} />);

      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toHaveLength(1);
    });

    it("does not move to another component when the first one unmounts", async () => {
      setupQuestionEndpoints({
        card: TEST_CARD,
        cardQueryResponse: defer<Dataset>().promise,
      });
      setupQuestionEndpoints({ card: OTHER_CARD });

      const { rerender } = renderSdkComponent(
        <StaticQuestion key="first" questionId={TEST_CARD.id} />,
      );
      await waitForCardQueryRequest(TEST_CARD);

      rerender(<StaticQuestion key="second" questionId={OTHER_CARD.id} />);

      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toEqual([]);
    });
  });

  describe("when the page was hidden", () => {
    const HIDDEN_VISIBILITY_ENTRY: PerformanceEntry = {
      name: "hidden",
      entryType: "visibility-state",
      startTime: 50,
      duration: 0,
      toJSON: () => ({}),
    };

    const setPageVisibility = (state: DocumentVisibilityState) => {
      jest.spyOn(document, "visibilityState", "get").mockReturnValue(state);
      document.dispatchEvent(new Event("visibilitychange"));
    };

    afterEach(() => {
      jest.restoreAllMocks();
      Reflect.deleteProperty(performance, "getEntriesByType");
    });

    it("sends no event, even if the page became visible again before the query returned", async () => {
      watchSdkPageVisibility();
      const cardQuery = defer<Dataset>();
      setupQuestionEndpoints({ cardQueryResponse: cardQuery.promise });
      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);
      await waitForCardQueryRequest();

      setPageVisibility("hidden");
      setPageVisibility("visible");
      cardQuery.resolve(TEST_DATASET);

      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toEqual([]);
    });

    it("sends no event, also when the browser saw it hidden before the bundle ran", async () => {
      // We add the visibility history, because jsdom has none
      Object.defineProperty(performance, "getEntriesByType", {
        configurable: true,
        value: (entryType: string) =>
          entryType === "visibility-state" ? [HIDDEN_VISIBILITY_ENTRY] : [],
      });
      watchSdkPageVisibility();
      setupQuestionEndpoints();

      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toEqual([]);
    });
  });

  describe("when the page is not a production React SDK page", () => {
    it.each<[string, keyof typeof PRODUCTION_REACT_SDK_PAGE]>([
      ["on localhost", "isLocalhost"],
      ["in a host app in dev mode", "isHostAppInDevMode"],
      ["in an embed preview", "isEmbedPreview"],
      ["in Embedded Analytics JS", "isEmbeddingEajs"],
      ["in a data app", "isDataApp"],
      ["in an MCP app", "isEmbeddingMcpApp"],
    ])("sends no event %s", async (_pageName, pageCondition) => {
      mockPage[pageCondition] = true;
      setupQuestionEndpoints();

      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

      expect(await screen.findByText("Test Row")).toBeInTheDocument();
      expect(getPerformanceEvents()).toEqual([]);
    });
  });

  describe("the bundle_load_start mark", () => {
    const BUNDLE_URL = "http://localhost/app/embedding-sdk.js";

    const addBundleScript = ({
      addedAtMs,
    }: {
      // Older packages do not set it
      addedAtMs?: string;
    } = {}) => {
      const script = document.createElement("script");
      script.src = BUNDLE_URL;
      script.dataset.embeddingSdkBundle = "true";
      if (addedAtMs !== undefined) {
        script.dataset[SDK_SCRIPT_ADDED_AT_DATASET_KEY] = addedAtMs;
      }
      document.head.appendChild(script);
    };

    const setBundleRequestStart = (startTime: number) => {
      const bundleEntry: PerformanceEntry = {
        name: BUNDLE_URL,
        entryType: "resource",
        startTime,
        duration: 0,
        toJSON: () => ({}),
      };
      // We add the resource timing, because jsdom has none
      Object.defineProperty(performance, "getEntriesByName", {
        configurable: true,
        value: (name: string) => (name === BUNDLE_URL ? [bundleEntry] : []),
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(performance, "getEntriesByName");
      document.head
        .querySelector("script[data-embedding-sdk-bundle]")
        ?.remove();
    });

    it("is the time the package added the bundle script", async () => {
      addBundleScript({ addedAtMs: "123.4" });
      setBundleRequestStart(140.2);
      setupQuestionEndpoints();

      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

      expect(await waitForSinglePerformanceEvent()).toMatchObject({
        bundle_load_start: 123,
      });
    });

    it("is the time the browser requested the bundle, when the package did not record it", async () => {
      addBundleScript();
      setBundleRequestStart(140.2);
      setupQuestionEndpoints();

      renderSdkComponent(<StaticQuestion questionId={TEST_CARD.id} />);

      expect(await waitForSinglePerformanceEvent()).toMatchObject({
        bundle_load_start: 140,
      });
    });
  });
});
