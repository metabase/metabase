import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";
import type { PropsWithChildren } from "react";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { getTestStoreAndWrapper, waitFor } from "__support__/ui";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import * as embeddingSdkConfig from "metabase/embedding-sdk/config";
import * as iframeUtils from "metabase/utils/iframe";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
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
    fetchMock.get(`path:/api/public/dashboard/${uuid}`, dashboard);
  }
  if (token) {
    fetchMock.get(`path:/api/embed/dashboard/${token}`, dashboard);
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
