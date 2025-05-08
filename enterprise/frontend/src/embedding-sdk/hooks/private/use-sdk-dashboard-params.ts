import type { Query } from "history";
import { pick } from "underscore";

import type { SdkDashboardId } from "embedding-sdk/types/dashboard";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { isNotNull } from "metabase/lib/types";

export type SdkDashboardDisplayProps = {
  /**
   * The ID of the dashboard.
   *  <br/>
   * This is either:
   *  <br/>
   *  - the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
   *  <br/>
   *  - the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data
   */
  dashboardId: SdkDashboardId;

  /**
   * Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.
   * <br/>
   * <br/>
   * @remarks
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
   */
  initialParameters?: Query;

  /**
   * Whether the dashboard should display a title.
   */
  withTitle?: boolean;

  /**
   * Whether the dashboard cards should display a title.
   */
  withCardTitle?: boolean;

  /**
   * Whether to hide the download button.
   */
  withDownloads?: boolean;

  /**
   * Whether to display the footer.
   */
  withFooter?: boolean;

  /**
   * A list of [parameters to hide](https://www.metabase.com/docs/latest/embedding/public-links.html#appearance-parameters).
   * <br/>
   * <br/>
   * @remarks
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
   **/
  hiddenParameters?: string[];
} & CommonStylingProps;

export const useSdkDashboardParams = ({
  dashboardId: initialDashboardId,
  withDownloads,
  withTitle,
  withFooter,
  hiddenParameters,
  initialParameters = {},
}: SdkDashboardDisplayProps) => {
  const { id: dashboardId, isLoading = false } = useValidatedEntityId({
    type: "dashboard",
    id: initialDashboardId,
  });

  // temporary name until we change `hideDownloadButton` to `downloads`
  const hideDownloadButton = !withDownloads;

  const displayOptions: EmbedDisplayParams = {
    ...DEFAULT_DASHBOARD_DISPLAY_OPTIONS,
    ...pick(
      {
        titled: withTitle,
        hideDownloadButton,
        hideParameters: hiddenParameters?.join(",") ?? null,
        withFooter,
      },
      isNotNull,
    ),
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams: initialParameters,
  });
  const { isFullscreen, onFullscreenChange, ref } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({
      onRefresh: refreshDashboard,
    });

  return {
    displayOptions,
    isFullscreen,
    onFullscreenChange,
    ref,
    onRefreshPeriodChange,
    refreshPeriod,
    setRefreshElapsedHook,
    dashboardId,
    isLoading,
  };
};
