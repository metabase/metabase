import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import type { SdkDashboardDisplayProps } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { DashboardContextProps } from "metabase/dashboard/context";

import type { InteractiveDashboardContextType } from "../InteractiveDashboard/context";
import type { DrillThroughQuestionProps } from "../InteractiveQuestion";

import type { useCommonDashboardParams } from "./use-common-dashboard-params";

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
    drillThroughQuestionHeight?: CSSProperties["height"];

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
    DashboardEventHandlersProps &
    Pick<DashboardContextProps, "getClickActionMode">
>;

export type SdkDashboardInternalProps = Pick<
  SdkDashboardProps,
  | "renderDrillThroughQuestion"
  | "plugins"
  | "drillThroughQuestionHeight"
  | "drillThroughQuestionProps"
> &
  Pick<InteractiveDashboardContextType, "dashboardActions"> &
  Omit<
    ReturnType<typeof useCommonDashboardParams>,
    "onNavigateToNewCardFromDashboard"
  > & {
    initialDashboardId: SdkDashboardProps["dashboardId"];
    dashboardId: Nullable<SdkDashboardProps["dashboardId"]>;
  };
