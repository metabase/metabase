import { useCallback, useMemo } from "react";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { isQuestionCard } from "metabase/dashboard/utils";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

import { interactiveDashboardSchema } from "./InteractiveDashboard.schema";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

const InteractiveDashboardInner = (props: InteractiveDashboardProps) => {
  const globalPlugins = useSdkSelector(getPlugins);

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...props.plugins };
  }, [globalPlugins, props.plugins]);

  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      getEmbeddingMode({
        question,
        queryMode: EmbeddingSdkMode,
        plugins: plugins as InternalMetabasePluginsConfig,
      }),
    [plugins],
  );

  return (
    <SdkDashboard
      {...props}
      getClickActionMode={getClickActionMode}
      dashboardActions={[
        DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
        DASHBOARD_ACTION.DOWNLOAD_PDF,
      ]}
      dashcardMenu={({ dashcard, result, downloadsEnabled }) =>
        downloadsEnabled?.results &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
        )
      }
    />
  );
};

export const InteractiveDashboard = Object.assign(
  withPublicComponentWrapper(InteractiveDashboardInner, {
    supportsGuestEmbed: false,
  }),
  {
    schema: interactiveDashboardSchema,
  },
);
