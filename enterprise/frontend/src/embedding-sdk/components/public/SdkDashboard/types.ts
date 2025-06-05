import type { PropsWithChildren, ReactNode } from "react";

import type { SdkDashboardDisplayProps } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { DashboardContextProps } from "metabase/dashboard/context";

import type { InteractiveDashboardContextType } from "../InteractiveDashboard/context";
import type { DrillThroughQuestionProps } from "../InteractiveQuestion";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type SdkDashboardProps = PropsWithChildren<
  {
    /**
     * Height of a question component when drilled from the dashboard to a question level.
     */
    drillThroughQuestionHeight?: number;

    // @todo pass the question context to the question view component,
    //       once we have a public-facing question context.
    /**
     * A custom React component to render the question layout.
     * Use namespaced InteractiveQuestion components to build the layout.
     */
    renderDrillThroughQuestion?: () => ReactNode;

    /**
     * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
     */
    plugins?: MetabasePluginsConfig;

    /**
     * Props for the drill-through question
     */
    drillThroughQuestionProps?: DrillThroughQuestionProps;
  } & SdkDashboardDisplayProps &
    DashboardEventHandlersProps
>;

export type SdkDashboardInternalProps = SdkDashboardProps &
  Pick<InteractiveDashboardContextType, "dashboardActions"> &
  Pick<DashboardContextProps, "getClickActionMode">;
