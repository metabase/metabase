import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import type { SdkDashboardDisplayProps } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import type {
  DashboardEventHandlersProps,
  SdkDashboardId,
} from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import type { DashboardContextProps } from "metabase/dashboard/context";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

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
    CommonStylingProps &
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
