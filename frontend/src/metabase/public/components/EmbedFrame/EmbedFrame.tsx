import cx from "classnames";
import { type ReactNode, useRef, useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { TitleAndDescription } from "metabase/common/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import TransitionS from "metabase/css/core/transitions.module.css";
import DashboardS from "metabase/dashboard/components/Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "metabase/dashboard/components/Dashboard/DashboardComponents";
import { ExportAsPdfButton } from "metabase/dashboard/components/DashboardHeader/buttons/ExportAsPdfButton";
import { FilterApplyToast } from "metabase/dashboard/components/FilterApplyToast";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  EmbeddingFooter,
  type FooterVariant,
} from "metabase/embedding/components/EmbeddingFooter/EmbeddingFooter";
import EmbedThemeS from "metabase/embedding/theme.module.css";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { SyncedParametersList } from "metabase/parameters/components/SyncedParametersList";
import { useSyncUrlParameters } from "metabase/parameters/components/use-sync-url-parameters";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Stack } from "metabase/ui";
import { getDashboardType } from "metabase/utils/dashboard";
import { initializeIframeResizer, isSmallScreen } from "metabase/utils/dom";
import {
  DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID,
  DASHBOARD_PDF_EXPORT_ROOT_ID,
} from "metabase/visualizations/lib/save-dashboard-pdf";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Dashboard,
  Parameter,
  ParameterId,
  ParameterValuesMap,
} from "metabase-types/api";

import type { DashboardUrlHashOptions } from "../../../dashboard/types";

import EmbedFrameS from "./EmbedFrame.module.css";
import { useGlobalTheme } from "./useGlobalTheme";

export type EmbedFrameBaseProps = Partial<{
  className: string;
  name: string | null;
  description: string | null;
  question: Question | null;
  dashboard: Dashboard | null;
  headerButtons: ReactNode;
  actionButtons: ReactNode;
  footerVariant: FooterVariant;
  parameters: Parameter[];
  parameterValues: ParameterValuesMap;
  draftParameterValues: ParameterValuesMap;
  hiddenParameterSlugs: string;
  enableParameterRequiredBehavior: boolean;
  setParameterValue: (parameterId: ParameterId, value: any) => void;
  setParameterValueToDefault: (id: ParameterId) => void;
  children: ReactNode;
  dashboardTabs: ReactNode;
  pdfDownloadsEnabled: boolean;
  withFooter: boolean;
  contentClassName?: string;
}>;

type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type EmbedFrameProps = EmbedFrameBaseProps &
  WithRequired<DashboardUrlHashOptions, "background">;

export const EmbedFrame = ({
  className,
  children,
  name,
  description,
  question,
  dashboard,
  actionButtons,
  headerButtons = null,
  dashboardTabs = null,
  footerVariant = "default",
  parameters,
  parameterValues,
  draftParameterValues,
  hiddenParameterSlugs,
  setParameterValue,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
  background,
  bordered,
  titled,
  theme,
  hide_parameters,
  pdfDownloadsEnabled = true,
  withFooter = true,
  contentClassName,
}: EmbedFrameProps) => {
  useGlobalTheme(theme);
  const hasEmbedBranding = useSelector(
    (state) => !getSetting(state, "hide-embed-branding?"),
  );

  const isPublicDashboard = Boolean(
    dashboard && getDashboardType(dashboard.id) === "public",
  );

  const isQuestion = question != null;
  const isDashboard = dashboard != null;
  const ParametersListComponent = getParametersListComponent({
    isQuestion,
    isDashboard,
  });

  const [hasFrameScroll, setHasFrameScroll] = useState(!isEmbeddingSdk());

  useMount(() => {
    initializeIframeResizer(() => setHasFrameScroll(false));
  });

  const parameterPanelRef = useRef<HTMLElement>(null);
  const {
    isSticky: isParameterPanelSticky,
    isStickyStateChanging: isParameterPanelStickyStateChanging,
  } = useIsParameterPanelSticky({ parameterPanelRef });

  const hideParameters = [hide_parameters, hiddenParameterSlugs]
    .filter(Boolean)
    .join(",");

  const isFooterEnabled =
    withFooter && (hasEmbedBranding || pdfDownloadsEnabled || actionButtons);

  const finalName = titled ? name : null;

  const hasParameters = Array.isArray(parameters) && parameters.length > 0;
  const visibleParameters = hasParameters
    ? getVisibleParameters(parameters, hideParameters)
    : [];
  const hasVisibleParameters = visibleParameters.length > 0;

  const hasHeader = Boolean(finalName || dashboardTabs) || pdfDownloadsEnabled;

  const allowParameterPanelSticky =
    !!dashboard && isParametersWidgetContainersSticky(visibleParameters.length);
  const shouldApplyParameterPanelThemeChangeTransition =
    !isParameterPanelStickyStateChanging && isParameterPanelSticky;

  const valuePopulatedParameters = parameters
    ? getValuePopulatedParameters({
        parameters,
        values: _.isEmpty(draftParameterValues)
          ? parameterValues
          : draftParameterValues,
      })
    : [];

  useSyncUrlParameters({
    parameters: valuePopulatedParameters,
    enabled: shouldSyncUrlParameters({
      isQuestion,
      isDashboard,
    }),
  });

  const hasDashboardTabs = dashboard?.tabs && dashboard.tabs.length > 1;

  return (
    <Stack
      className={cx(
        className,
        EmbedFrameS.overflowAuto,
        EmbedThemeS.EmbedFrame,
        {
          [EmbedThemeS.NoBackground]: !background,
          [EmbedFrameS.border]: bordered,
          [EmbedFrameS.printOverflowVisible]: isPublicDashboard,
        },
      )}
      gap={0}
      pos={hasFrameScroll ? "absolute" : undefined}
      inset={hasFrameScroll ? 0 : undefined}
      data-testid="embed-frame"
      data-embed-theme={theme}
    >
      <Stack
        id={DASHBOARD_PDF_EXPORT_ROOT_ID}
        // flex stays a class, so a contentClassName can still override it
        className={cx(contentClassName, CS.flexFull, {
          [EmbedThemeS.ContentContainer]: true,
          [EmbedThemeS.WithThemeBackground]: true,

          // If we are showing a standalone question, make the entire card a hover parent
          [CS.hoverParent]: question,
          [CS.hoverVisibility]: question,
        })}
        gap={0}
        pos="relative"
      >
        {hasHeader && (
          <Stack
            component="header"
            className={cx(
              EmbedThemeS.EmbedFrameHeader,
              SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS,
            )}
            gap={0}
            data-testid="embed-frame-header"
          >
            {(finalName || pdfDownloadsEnabled) && (
              <FullWidthContainer
                mt={finalName ? { base: "sm", sm: "lg", lg: "xl" } : "sm"}
              >
                <FixedWidthContainer
                  className={cx(CS.flex, CS.alignCenter)}
                  data-testid="fixed-width-dashboard-header"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  {finalName && (
                    <TitleAndDescription
                      title={finalName}
                      description={description}
                      className={CS.my2}
                    />
                  )}
                  <Box style={{ flex: 1 }} />
                  {dashboard && pdfDownloadsEnabled && (
                    <ExportAsPdfButton
                      className={cx({
                        [EmbedFrameS.CompactExportAsPdfButton]:
                          !titled && (hasVisibleParameters || hasDashboardTabs),
                        [EmbedFrameS.ParametersVisibleWithNoTabs]:
                          hasVisibleParameters && !hasDashboardTabs,
                      })}
                    />
                  )}
                  {headerButtons}
                </FixedWidthContainer>
              </FullWidthContainer>
            )}
            {dashboardTabs && (
              <FullWidthContainer
                className={cx(EmbedFrameS.dashboardTabs, {
                  [EmbedFrameS.narrowTabs]: !titled && pdfDownloadsEnabled,
                })}
              >
                <FixedWidthContainer
                  data-testid="fixed-width-dashboard-tabs"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  {dashboardTabs}
                </FixedWidthContainer>
              </FullWidthContainer>
            )}

            {finalName && (
              <div
                className={cx(EmbedThemeS.Separator, EmbedFrameS.borderBottom)}
              />
            )}
          </Stack>
        )}

        {/* show floating header buttons if there is no title */}
        {headerButtons && !titled ? headerButtons : null}

        <span ref={parameterPanelRef} style={{ position: "relative" }} />
        {hasVisibleParameters && (
          <FullWidthContainer
            className={cx(EmbedFrameS.ParameterPanel, {
              [TransitionS.transitionThemeChange]:
                shouldApplyParameterPanelThemeChangeTransition,
              [EmbedFrameS.IsSticky]: isParameterPanelSticky,
              [cx(CS.z3, CS.wFull, EmbedFrameS.AllowSticky)]:
                allowParameterPanelSticky,
            })}
            data-testid="dashboard-parameters-widget-container"
            py="0.5rem"
          >
            <FixedWidthContainer
              className={DashboardS.ParametersFixedWidthContainer}
              id={DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}
              data-testid="fixed-width-filters"
              isFixedWidth={dashboard?.width === "fixed"}
            >
              <ParametersListComponent
                cardId={question?.id()}
                dashboardId={dashboard?.id}
                parameters={valuePopulatedParameters}
                setParameterValue={setParameterValue}
                hideParameters={hideParameters}
                setParameterValueToDefault={setParameterValueToDefault}
                enableParameterRequiredBehavior={
                  enableParameterRequiredBehavior
                }
              />
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
        <Stack component="main" gap={0} flex="1 0 auto" pos="relative">
          {children}
        </Stack>
      </Stack>

      {dashboard && <FilterApplyToast position="fixed" />}
      {isFooterEnabled && (
        <EmbeddingFooter
          variant={footerVariant}
          isDarkMode={theme === "night"}
          hasEmbedBranding={hasEmbedBranding}
        >
          {actionButtons && footerVariant === "default" && (
            <Box c="text-secondary" ml="auto">
              {actionButtons}
            </Box>
          )}
        </EmbeddingFooter>
      )}
    </Stack>
  );
};

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}

function getParametersListComponent({
  isQuestion,
  isDashboard,
}: {
  isQuestion: boolean;
  isDashboard: boolean;
}) {
  return shouldSyncUrlParameters({ isQuestion, isDashboard })
    ? SyncedParametersList
    : ParametersList;
}

function shouldSyncUrlParameters({
  isQuestion,
  isDashboard,
}: {
  isQuestion: boolean;
  isDashboard: boolean;
}) {
  // Couldn't determine if it's a question or a dashboard until one becomes true.
  if (!isQuestion && !isDashboard) {
    return false;
  }

  if (isDashboard) {
    // Dashboards manage parameters themselves
    return false;
  } else {
    /**
     * We don't want to sync the query string to the URL when using the embedding SDK,
     * because it would change the URL of users' apps.
     */
    return !isEmbeddingSdk();
  }
}
