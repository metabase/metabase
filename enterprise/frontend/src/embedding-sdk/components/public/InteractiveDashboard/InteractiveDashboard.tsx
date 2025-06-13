import type { PropsWithChildren } from "react";

import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = ({
  plugins,
  ...sdkDashboardProps
}: PropsWithChildren<SdkDashboardProps> &
  Pick<SdkDashboardProps, "drillThroughQuestionProps">) => (
  <SdkDashboard
    {...sdkDashboardProps}
    plugins={{
      ...plugins,
      dashboard: {
        ...plugins?.dashboard,
        dashboardCardMenu: {
          ...plugins?.dashboard?.dashboardCardMenu,
          withDownloads: sdkDashboardProps.withDownloads,
          withEditLink: false,
        },
      },
    }}
    getClickActionMode={({ question }: { question: Question }) =>
      getEmbeddingMode({
        question,
        queryMode: EmbeddingSdkMode,
        plugins: plugins as InternalMetabasePluginsConfig,
      })
    }
  />
);
