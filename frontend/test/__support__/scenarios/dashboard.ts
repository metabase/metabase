import type { DashboardState } from "metabase/redux/store";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import type { Dashboard, DashboardQueryMetadata } from "metabase-types/api";
import { createMockDashboardQueryMetadata } from "metabase-types/api/mocks";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "../server-mocks";

export type DashboardScenarioOptions = {
  dashboard: Dashboard;
  /** Defaults to a bare `createMockDashboardQueryMetadata()`. */
  metadata?: DashboardQueryMetadata;
};

/**
 * Registers the endpoints any dashboard render path needs:
 *   - GET/PUT `/api/dashboard/:id`
 *   - GET `/api/dashboard/:id/query_metadata`
 *
 * The `dashboard` is threaded through both so IDs stay in sync.
 */
export function setupDashboardScenario({
  dashboard,
  metadata = createMockDashboardQueryMetadata(),
}: DashboardScenarioOptions) {
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(dashboard, metadata);
}

/**
 * Builds the Redux `dashboard` slice for a test that pre-seeds a dashboard
 * into store state. Handles the parallel-ID problem where the slice stores
 * dashcards as IDs in `dashboards[id].dashcards` and the actual dashcard
 * objects in a separate `dashcards` map keyed by ID.
 */
export function createDashboardReduxState(
  dashboard: Dashboard,
  extra: Partial<DashboardState> = {},
): DashboardState {
  return createMockDashboardState({
    dashboardId: dashboard.id,
    dashboards: {
      [dashboard.id]: {
        ...dashboard,
        dashcards: dashboard.dashcards.map((dc) => dc.id),
      },
    },
    dashcards: Object.fromEntries(
      dashboard.dashcards.map((dc) => [
        dc.id,
        { ...dc, isDirty: false, isRemoved: false },
      ]),
    ),
    ...extra,
  });
}
