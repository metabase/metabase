import { pick } from "underscore";

import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { isNotNull } from "metabase/lib/types";

/**
 * @inline
 */
export type SdkDashboardEntityInternalProps = {
  dashboardId?: SdkDashboardId | null;
  token?: SdkEntityToken | null;
};

export type SdkDashboardDisplayProps = SdkDashboardEntityInternalProps & {
  /**
   * Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
   */
  initialParameters?: ParameterValues;

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
   * Whether to show the subscriptions button.
   */
  withSubscriptions?: boolean;

  /**
   * A list of [parameters to hide](https://www.metabase.com/docs/latest/embedding/public-links.html#appearance-parameters).
   * <br/>
   * - Combining {@link SdkDashboardProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
   * <br/>
   * - Combining {@link SdkDashboardProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
   **/
  hiddenParameters?: string[];

  /**
   * When true, internal click behaviors (links to dashboards/questions) are preserved.
   * When false (default for SDK), these click behaviors are filtered out.
   */
  enableEntityNavigation?: boolean;
} & CommonStylingProps;

export const useSdkDashboardParams = ({
  withDownloads,
  withSubscriptions,
  withTitle,
  withCardTitle,
  hiddenParameters,
}: Pick<
  SdkDashboardDisplayProps,
  | "withDownloads"
  | "withSubscriptions"
  | "withTitle"
  | "withCardTitle"
  | "hiddenParameters"
>) => {
  // temporary name until we change `hideDownloadButton` to `downloads`
  const hideDownloadButton = !withDownloads;

  const displayOptions: EmbedDisplayParams = {
    ...DEFAULT_DASHBOARD_DISPLAY_OPTIONS,
    ...pick(
      {
        titled: withTitle,
        cardTitled: withCardTitle,
        hideDownloadButton,
        downloadsEnabled: { pdf: withDownloads, results: withDownloads },
        withSubscriptions,
        hideParameters: hiddenParameters?.join(",") ?? null,
      },
      isNotNull,
    ),
  };
  return {
    displayOptions,
  };
};
