import { pick } from "underscore";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in JSDoc comment
import type { SdkDashboardProps } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboard";
import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { isNotNull } from "metabase/lib/types";

export type SdkDashboardDisplayProps = {
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
};

export const useSdkDashboardParams = ({
  withDownloads,
  withSubscriptions,
  withTitle,
  withCardTitle,
  hiddenParameters,
}: Required<SdkDashboardDisplayProps>) => {
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
