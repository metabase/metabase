import type { DashboardTabId } from "metabase-types/api";

/**
 * SDK related state that's read in the SDK.
 * This is probably something we should avoid adding to, to keep
 * SDK code and core app code decoupled
 */
export interface SdkSharedState {
  /**
   * Tab to apply when the next dashboard mounts via a cross-dashboard
   * click behavior. Not cleared after use: tab IDs are globally unique
   * PKs, so stale values can't match another dashboard's tabs, and the
   * selector falls back to the first tab via a `hasTab` guard. Every
   * cross-dashboard push overwrites this slot anyway.
   */
  initialDashboardTabId: DashboardTabId | null;
}

export interface SdkSharedStoreState {
  sdk: SdkSharedState;
}
