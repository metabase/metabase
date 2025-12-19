import { EMBED_FALLBACK_DASHBOARD_ID } from "metabase/embedding/embedding-iframe-sdk-setup/constants";
import type { SdkIframeEmbedSetupRecentItem } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { DashboardId } from "metabase-types/api";

export const determineDashboardId = ({
  isRecentsLoading,
  recentDashboards,
  exampleDashboardId,
}: {
  isRecentsLoading: boolean;
  recentDashboards: SdkIframeEmbedSetupRecentItem[];
  exampleDashboardId: DashboardId | null;
}) =>
  isRecentsLoading
    ? null
    : (recentDashboards[0]?.id ??
      exampleDashboardId ??
      EMBED_FALLBACK_DASHBOARD_ID);
