import { pick } from "underscore";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
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
   * A list of [parameters to hide](https://www.metabase.com/docs/latest/embedding/public-links.html#appearance-parameters).
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
   * <br/>
   * - Combining {@link SdkDashboardDisplayProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
   **/
  hiddenParameters?: string[];
} & CommonStylingProps;

export const useSdkDashboardParams = ({
  withDownloads,
  withTitle,
  withCardTitle,
  hiddenParameters,
}: SdkDashboardDisplayProps) => {
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
        hideParameters: hiddenParameters?.join(",") ?? null,
      },
      isNotNull,
    ),
  };
  return {
    displayOptions,
  };
};
