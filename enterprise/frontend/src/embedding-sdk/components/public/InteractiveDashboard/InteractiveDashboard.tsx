import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import { renderOnlyInSdkProvider } from "embedding-sdk/components/private/SdkContext";
import type { SdkDashboardDisplayProps } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

import { type EditableDashboardProps, SdkDashboard } from "./EditableDashboard";
import type { InteractiveDashboardContextType } from "./context";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = {
  /**
   * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
   */
  plugins?: MetabasePluginsConfig;

  // @todo pass the question context to the question view component,
  //       once we have a public-facing question context.
  /**
   * A custom React component to render the question layout.
   * Use namespaced InteractiveQuestion components to build the layout.
   */
  renderDrillThroughQuestion?: () => ReactNode;

  /**
   * Height of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionHeight?: CSSProperties["height"];

  /**
   * Props of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

const InteractiveDashboardInner = ({
  drillThroughQuestionProps,
  ...sdkDashboardProps
}: PropsWithChildren<EditableDashboardProps> &
  Pick<EditableDashboardProps, "drillThroughQuestionProps">) => {
  const dashboardActions: InteractiveDashboardContextType["dashboardActions"] =
    [null];
  return (
    <SdkDashboard {...sdkDashboardProps} dashboardActions={dashboardActions} />
  );
};

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = renderOnlyInSdkProvider(
  InteractiveDashboardInner,
);
