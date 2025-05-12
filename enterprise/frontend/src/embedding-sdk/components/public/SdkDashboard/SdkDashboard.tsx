import type { CSSProperties, ReactNode } from "react";
import { match } from "ts-pattern";
import { pick } from "underscore";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  PublicComponentWrapper,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkDashboardDisplayProps } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import type {
  DashboardEventHandlersProps,
  MetabasePluginsConfig,
} from "embedding-sdk/types";
import CS from "metabase/css/core/index.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import {
  type DashboardContextProps,
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { isNotNull } from "metabase/lib/types";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { Flex } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

import {
  type InteractiveDashboardContextType,
  InteractiveDashboardProvider,
} from "../InteractiveDashboard/context";
import { useCommonDashboardParams } from "../InteractiveDashboard/use-common-dashboard-params";
import type { DrillThroughQuestionProps } from "../InteractiveQuestion";
import type { EmbedDisplayParams } from "../StaticDashboard";
import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

export type SdkDashboardProps = {
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
  drillThroughQuestionHeight?: number;

  /**
   * Props of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & SdkDashboardDisplayProps &
  DashboardEventHandlersProps &
  Pick<
    DashboardContextProps,
    "refreshPeriod" | "background" | "bordered" | "font" | "theme"
  > & {
    style?: CSSProperties;
    className?: string;
    // @internal
    mode?: "static" | "interactive" | "editable";
  };

const SdkDashboardInner = ({
  mode = "interactive",
  plugins,
  onEditQuestion,
}: Pick<SdkDashboardProps, "mode"> &
  Pick<InteractiveDashboardContextType, "onEditQuestion" | "plugins">) => {
  const { isEditing } = useDashboardContext();
  const dashboardActions = match({ mode, isEditing })
    .with({ mode: "static" }, () => DASHBOARD_DISPLAY_ACTIONS)
    .with({ mode: "interactive" }, () => DASHBOARD_DISPLAY_ACTIONS)
    .with(
      { mode: "editable", isEditing: true },
      () => DASHBOARD_EDITING_ACTIONS,
    )
    .with(
      { mode: "editable", isEditing: false },
      () => SDK_DASHBOARD_VIEW_ACTIONS,
    )
    .exhaustive();

  return (
    <InteractiveDashboardProvider
      plugins={plugins}
      onEditQuestion={onEditQuestion}
      dashboardActions={dashboardActions}
    >
      <Dashboard />
    </InteractiveDashboardProvider>
  );
};

export const SdkDashboard = withPublicComponentWrapper(
  ({
    dashboardId,
    initialParameters,
    onLoad,
    onLoadWithoutCards,

    mode = "interactive",
    plugins,
    refreshPeriod = null,
    background = true,
    bordered = true,
    font = null,
    theme = "light",
    withFooter = true,
    withCardTitle = true,
    withDownloads = false,
    hiddenParameters,
    withTitle,
    drillThroughQuestionHeight,
    drillThroughQuestionProps = {
      title: withTitle,
      height: drillThroughQuestionHeight,
      plugins: plugins,
    },
  }: SdkDashboardProps) => {
    const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
      onLoad,
      onLoadWithoutCards,
    });

    const displayOptions: EmbedDisplayParams = {
      ...DEFAULT_DASHBOARD_DISPLAY_OPTIONS,
      ...pick(
        {
          background,
          bordered,
          withCardTitle,
          titled: withTitle,
          hideParameters: hiddenParameters?.join(",") ?? null,
          font,
          theme,
          downloadsEnabled: { pdf: withDownloads, results: withDownloads },
          withFooter,
        },
        isNotNull,
      ),
    };

    const {
      adhocQuestionUrl,
      onNavigateBackToDashboard,
      onEditQuestion,
      onNavigateToNewCardFromDashboard,
    } = useCommonDashboardParams({
      dashboardId,
      mode,
    });

    return (
      <Flex
        component={PublicComponentWrapper}
        mih="100vh"
        bg="bg-dashboard"
        direction="column"
        justify="flex-start"
        align="stretch"
        className={CS.overflowAuto}
      >
        <DashboardContextProvider
          dashboardId={dashboardId}
          parameterQueryParams={initialParameters}
          refreshPeriod={refreshPeriod}
          downloadsEnabled={displayOptions.downloadsEnabled}
          background={displayOptions.background}
          bordered={displayOptions.bordered}
          hideParameters={displayOptions.hideParameters}
          titled={displayOptions.titled}
          cardTitled={displayOptions.cardTitled}
          theme={displayOptions.theme}
          onLoad={handleLoad}
          onLoadWithoutCards={handleLoadWithoutCards}
          {...(mode === "static"
            ? {
                navigateToNewCardFromDashboard: null,
                getClickActionMode: ({ question }) =>
                  getEmbeddingMode({
                    question,
                    queryMode: StaticQuestionSdkMode,
                    plugins: plugins as InternalMetabasePluginsConfig,
                  }),
              }
            : {
                navigateToNewCardFromDashboard:
                  onNavigateToNewCardFromDashboard,
                getClickActionMode: ({ question }) =>
                  getEmbeddingMode({
                    question,
                    plugins: plugins as InternalMetabasePluginsConfig,
                  }),
              })}
        >
          {adhocQuestionUrl ? (
            <InteractiveAdHocQuestion
              questionPath={adhocQuestionUrl}
              onNavigateBack={onNavigateBackToDashboard}
              {...drillThroughQuestionProps}
            />
          ) : (
            <SdkDashboardInner
              mode={mode}
              plugins={plugins}
              onEditQuestion={mode === "static" ? undefined : onEditQuestion}
            />
          )}
        </DashboardContextProvider>
      </Flex>
    );
  },
);
