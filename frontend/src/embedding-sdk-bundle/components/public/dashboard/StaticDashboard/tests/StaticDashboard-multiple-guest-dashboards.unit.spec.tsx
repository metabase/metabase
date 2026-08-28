import fetchMock from "fetch-mock";
import { SignJWT } from "jose";

import { mockGetBoundingClientRect, waitFor } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { Dashboard, DashboardId } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import { StaticDashboard } from "../StaticDashboard";

const SECRET = new TextEncoder().encode("test-secret-key-for-jwt-signing");

async function createDashboardJwt(dashboardId: DashboardId) {
  return new SignJWT({
    resource: { dashboard: dashboardId },
    params: {},
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(SECRET);
}

function setupEmbedDashboardEndpoint(token: string, dashboard: Dashboard) {
  fetchMock.get(`path:/api/embed/dashboard/${token}`, dashboard);
}

describe("StaticDashboard - multiple guest dashboards", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should keep each guest StaticDashboard on its own token when multiple mount under one provider", async () => {
    const dashboards = [1, 2].map((id) =>
      createMockDashboard({ id, name: `Dashboard ${id}`, dashcards: [] }),
    );
    const tokens = await Promise.all(
      dashboards.map((dashboard) => createDashboardJwt(dashboard.id)),
    );

    const { state } = setupSdkState({
      sdkState: createMockSdkState({
        // Let initGuestEmbed run so /api → /api/embed request rewriting is installed.
        initStatus: createMockLoginStatusState({ status: "uninitialized" }),
        isGuestEmbed: true,
      }),
    });

    dashboards.forEach((dashboard, index) => {
      setupEmbedDashboardEndpoint(tokens[index], dashboard);
    });

    const authConfig = createMockSdkConfig({ isGuest: true });

    const { rerender } = renderWithSDKProviders(
      <div>
        <StaticDashboard token={tokens[0]} />
      </div>,
      {
        componentProviderProps: { authConfig },
        storeInitialState: state,
      },
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/embed/dashboard/${tokens[0]}`),
      ).not.toHaveLength(0);
    });

    // Mount a second guest dashboard under the same provider/store. Each
    // instance keeps its own guest token (per-mount instance id), so neither
    // instance's request ends up carrying the other's JWT.
    rerender(
      <div>
        <StaticDashboard token={tokens[0]} />
        <StaticDashboard token={tokens[1]} />
      </div>,
    );

    await waitFor(() => {
      for (const token of tokens) {
        expect(
          fetchMock.callHistory.calls(`path:/api/embed/dashboard/${token}`),
        ).not.toHaveLength(0);
      }
    });
  });
});
