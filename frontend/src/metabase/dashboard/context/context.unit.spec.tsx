import { act, renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";
import type { PropsWithChildren } from "react";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupEmbedDashboardEndpoints,
  setupPublicDashboardEndpoint,
} from "__support__/server-mocks";
import { getTestStoreAndWrapper, waitFor } from "__support__/ui";
import * as embeddingSdkConfig from "metabase/embedding-sdk/config";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import * as iframeUtils from "metabase/utils/iframe";
import { defer } from "metabase/utils/promise";
import type { Dataset } from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
} from "metabase-types/api/mocks";

import { DashboardContextProvider, useDashboardContext } from "./context";

const PUBLIC_UUID = "12345678-1234-1234-1234-123456789abc";
const EMBED_TOKEN = "header.payload.signature";

interface SetupOptions {
  uuid?: EntityUuid | null;
  token?: EntityToken | null;
  isGuestEmbed?: boolean;
  isWithinIframe?: boolean;
  isEmbeddingSdk?: boolean;
  withTimelineEvents?: boolean;
}

async function setup({
  uuid = null,
  token = null,
  isGuestEmbed = false,
  isWithinIframe = false,
  isEmbeddingSdk = false,
  withTimelineEvents,
}: SetupOptions = {}) {
  jest.spyOn(iframeUtils, "isWithinIframe").mockReturnValue(isWithinIframe);
  jest
    .spyOn(embeddingSdkConfig, "isEmbeddingSdk")
    .mockReturnValue(isEmbeddingSdk);

  const dashboard = createMockDashboard();
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata(),
  );
  if (uuid) {
    setupPublicDashboardEndpoint(uuid, dashboard);
  }
  if (token) {
    setupEmbedDashboardEndpoints(token, dashboard);
  }

  const { wrapper: Wrapper } = getTestStoreAndWrapper({ initialRoute: "/" });
  const utils = renderHook(useDashboardContext, {
    wrapper: ({ children }: PropsWithChildren) => (
      <Wrapper>
        <EmbeddingEntityContextProvider uuid={uuid} token={token}>
          <DashboardContextProvider
            dashboardId={uuid ?? dashboard.id}
            navigateToNewCardFromDashboard={null}
            isGuestEmbed={isGuestEmbed}
            withTimelineEvents={withTimelineEvents}
          >
            {children}
          </DashboardContextProvider>
        </EmbeddingEntityContextProvider>
      </Wrapper>
    ),
  });

  await waitFor(() => {
    expect(utils.result.current.dashboard?.name).toBe(dashboard.name);
  });

  return utils;
}

describe("DashboardContextProvider timeline event controls", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enables controls when requested on a regular dashboard", async () => {
    const { result } = await setup({ withTimelineEvents: true });

    expect(result.current.withTimelineEvents).toBe(true);
  });

  it("disables controls by default on a regular dashboard", async () => {
    const { result } = await setup();

    expect(result.current.withTimelineEvents).toBe(false);
  });

  it.each<[string, SetupOptions]>([
    ["public dashboards", { uuid: PUBLIC_UUID }],
    ["signed embedded dashboards", { token: EMBED_TOKEN }],
    ["guest embedded dashboards", { isGuestEmbed: true }],
    ["iframe dashboards", { isWithinIframe: true }],
    ["SDK dashboards", { isEmbeddingSdk: true }],
  ])(
    "disables controls on %s even when requested",
    async (_surface, options) => {
      const { result } = await setup({ ...options, withTimelineEvents: true });

      expect(result.current.withTimelineEvents).toBe(false);
    },
  );
});

describe("DashboardContextProvider auto-refresh", () => {
  const REFRESH_PERIOD_SECONDS = 60;
  const ADVANCE_PAST_PERIOD_MS = (REFRESH_PERIOD_SECONDS + 1) * 1000;

  const dashcard = createMockDashboardCard({
    id: 10,
    card_id: 20,
    card: createMockCard({ id: 20 }),
  });
  const dashboard = createMockDashboard({ dashcards: [dashcard] });
  const dashcardQueryUrl = `path:/api/dashboard/${dashboard.id}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`;
  const dashboardUrl = `path:/api/dashboard/${dashboard.id}`;

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function setupAutoRefresh() {
    setupDashboardEndpoints(dashboard);
    setupDashboardQueryMetadataEndpoint(
      dashboard,
      createMockDashboardQueryMetadata(),
    );
    const queryResponses = [defer<Dataset>(), defer<Dataset>()];
    let queryCount = 0;
    fetchMock.post(
      dashcardQueryUrl,
      () => queryResponses[queryCount++].promise,
    );

    const { wrapper: Wrapper } = getTestStoreAndWrapper({ initialRoute: "/" });
    const utils = renderHook(useDashboardContext, {
      wrapper: ({ children }: PropsWithChildren) => (
        <Wrapper>
          <DashboardContextProvider
            dashboardId={dashboard.id}
            navigateToNewCardFromDashboard={null}
          >
            {children}
          </DashboardContextProvider>
        </Wrapper>
      ),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls(dashcardQueryUrl)).toHaveLength(1);
    });

    return { ...utils, queryResponses };
  }

  const getDashboardFetchCount = () =>
    fetchMock.callHistory.calls(dashboardUrl, { method: "GET" }).length;
  const getQueryCount = () =>
    fetchMock.callHistory.calls(dashcardQueryUrl).length;

  it("should refresh only the card data and not fetch cards that are still loading (metabase#12578, metabase#62170)", async () => {
    const { result, queryResponses } = await setupAutoRefresh();
    const initialDashboardFetchCount = getDashboardFetchCount();

    act(() => result.current.onRefreshPeriodChange(REFRESH_PERIOD_SECONDS));

    // the initial query is still loading, so the refresh skips the card
    await act(() => jest.advanceTimersByTimeAsync(ADVANCE_PAST_PERIOD_MS));
    expect(getQueryCount()).toBe(1);

    await act(async () => {
      queryResponses[0].resolve(createMockDataset());
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(() => jest.advanceTimersByTimeAsync(ADVANCE_PAST_PERIOD_MS));
    await waitFor(() => expect(getQueryCount()).toBe(2));

    await act(async () => {
      queryResponses[1].resolve(createMockDataset());
    });
    expect(getDashboardFetchCount()).toBe(initialDashboardFetchCount);
  });
});
