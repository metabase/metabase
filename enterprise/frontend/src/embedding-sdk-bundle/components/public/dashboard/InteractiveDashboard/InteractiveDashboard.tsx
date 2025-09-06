import { useCallback } from "react";

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
  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      getEmbeddingMode({
        question,
        queryMode: EmbeddingSdkMode,
        plugins: props.plugins as InternalMetabasePluginsConfig,
      }),
    [props.plugins],
  );

  return (
    <SdkDashboard
      {...props}
      getClickActionMode={getClickActionMode}
      dashboardActions={({ downloadsEnabled }) => {
        return downloadsEnabled.pdf ? [DASHBOARD_ACTION.DOWNLOAD_PDF] : [];
      }}
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

export const InteractiveDashboard = Object.assign(InteractiveDashboardInner, {
  schema: interactiveDashboardSchema,
});
