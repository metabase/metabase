import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import TransitionS from "metabase/css/core/transitions.module.css";
import DashboardS from "metabase/dashboard/components/Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "metabase/dashboard/components/Dashboard/DashboardComponents";
import { ExportAsPdfButton } from "metabase/dashboard/components/DashboardHeader/buttons/ExportAsPdfButton";
import {
  DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID,
  DASHBOARD_PDF_EXPORT_ROOT_ID,
} from "metabase/dashboard/constants";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import { getDashboardType } from "metabase/dashboard/utils";
import { initializeIframeResizer, isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import type { DisplayTheme } from "metabase/public/lib/types";
import { SyncedParametersList } from "metabase/query_builder/components/SyncedParametersList";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { Box } from "metabase/ui";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/visualizations/lib/save-chart-image";
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
import type { FooterVariant } from "./EmbedFrame.styled";
import {
  ActionButtonsContainer,
  Body,
  ContentContainer,
  DashboardTabsContainer,
  Footer,
  Header,
  ParametersWidgetContainer,
  Root,
  Separator,
  TitleAndButtonsContainer,
  TitleAndDescriptionContainer,
} from "./EmbedFrame.styled";
import { LogoBadge } from "./LogoBadge";

export type EmbedFrameBaseProps = Partial<{
  className: string;
  name: string | null;
  description: string | null;
  question: Question;
  dashboard: Dashboard | null;
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
  downloadsEnabled: boolean;
  withFooter: boolean;
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
  downloadsEnabled = true,
  withFooter = true,
}: EmbedFrameProps) => {
  useGlobalTheme(theme);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const hasEmbedBranding = useSelector(
    state => !getSetting(state, "hide-embed-branding?"),
  );

  const isPublicDashboard = Boolean(
    dashboard && getDashboardType(dashboard.id) === "public",
  );

  const ParametersListComponent = getParametersListComponent({
    isEmbeddingSdk,
    isDashboard: !!dashboard,
  });

  const [hasFrameScroll, setHasFrameScroll] = useState(!isEmbeddingSdk);

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
    withFooter && (hasEmbedBranding || downloadsEnabled || actionButtons);

  const finalName = titled ? name : null;

  const hasParameters = Array.isArray(parameters) && parameters.length > 0;
  const visibleParameters = hasParameters
    ? getVisibleParameters(parameters, hideParameters)
    : [];
  const hasVisibleParameters = visibleParameters.length > 0;

  const hasHeader = Boolean(finalName || dashboardTabs) || downloadsEnabled;

  const allowParameterPanelSticky =
    !!dashboard && isParametersWidgetContainersSticky(visibleParameters.length);
  const shouldApplyParameterPanelThemeChangeTransition =
    !isParameterPanelStickyStateChanging && isParameterPanelSticky;

  return (
    <Root
      hasScroll={hasFrameScroll}
      isBordered={bordered}
      hasVisibleOverflowWhenPriting={isPublicDashboard}
      className={cx(className, EmbedFrameS.EmbedFrame, {
        [EmbedFrameS.NoBackground]: !background,
      })}
      data-testid="embed-frame"
      data-embed-theme={theme}
    >
      <ContentContainer
        id={DASHBOARD_PDF_EXPORT_ROOT_ID}
        className={cx(
          EmbedFrameS.ContentContainer,
          EmbedFrameS.WithThemeBackground,
        )}
      >
        {hasHeader && (
          <Header
            className={cx(
              EmbedFrameS.EmbedFrameHeader,
              SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS,
            )}
            data-testid="embed-frame-header"
          >
            {(finalName || downloadsEnabled) && (
              <TitleAndDescriptionContainer>
                <TitleAndButtonsContainer
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
                  {dashboard && downloadsEnabled && (
                    <ExportAsPdfButton dashboard={dashboard} color="brand" />
                  )}
                </TitleAndButtonsContainer>
              </TitleAndDescriptionContainer>
            )}
            {dashboardTabs && (
              <DashboardTabsContainer>
                <FixedWidthContainer
                  data-testid="fixed-width-dashboard-tabs"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  {dashboardTabs}
                </FixedWidthContainer>
              </DashboardTabsContainer>
            )}

            <Separator className={EmbedFrameS.Separator} />
          </Header>
        )}

        <span ref={parameterPanelRef} />
        {hasVisibleParameters && (
          <ParametersWidgetContainer
            className={cx({
              [TransitionS.transitionThemeChange]:
                shouldApplyParameterPanelThemeChangeTransition,
            })}
            embedFrameTheme={theme}
            allowSticky={allowParameterPanelSticky}
            isSticky={isParameterPanelSticky}
            data-testid="dashboard-parameters-widget-container"
          >
            <FixedWidthContainer
              className={DashboardS.ParametersFixedWidthContainer}
              id={DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID}
              data-testid="fixed-width-filters"
              isFixedWidth={dashboard?.width === "fixed"}
            >
              <ParametersListComponent
                question={question}
                dashboard={dashboard}
                parameters={getValuePopulatedParameters({
                  parameters,
                  values: _.isEmpty(draftParameterValues)
                    ? parameterValues
                    : draftParameterValues,
                })}
                setParameterValue={setParameterValue}
                hideParameters={hideParameters}
                setParameterValueToDefault={setParameterValueToDefault}
                enableParameterRequiredBehavior={
                  enableParameterRequiredBehavior
                }
              />
              {dashboard && <FilterApplyButton />}
            </FixedWidthContainer>
          </ParametersWidgetContainer>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {isFooterEnabled && (
        <Footer
          data-testid="embed-frame-footer"
          className={EmbedFrameS.EmbedFrameFooter}
          variant={footerVariant}
        >
          {hasEmbedBranding && <LogoBadge dark={theme === "night"} />}
          {actionButtons && (
            <ActionButtonsContainer>{actionButtons}</ActionButtonsContainer>
          )}
        </Footer>
      )}
    </Root>
  );
};

function useGlobalTheme(theme: DisplayTheme | undefined) {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  useEffect(() => {
    // We don't want to modify user application DOM when using the SDK.
    if (isEmbeddingSdk || theme == null) {
      return;
    }

    const originalTheme = document.documentElement.getAttribute(
      "data-metabase-theme",
    );
    document.documentElement.setAttribute("data-metabase-theme", theme);

    return () => {
      if (originalTheme == null) {
        document.documentElement.removeAttribute("data-metabase-theme");
      } else {
        document.documentElement.setAttribute(
          "data-metabase-theme",
          originalTheme,
        );
      }
    };
  }, [isEmbeddingSdk, theme]);
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}

function getParametersListComponent({
  isEmbeddingSdk,
  isDashboard,
}: {
  isEmbeddingSdk: boolean;
  isDashboard: boolean;
}) {
  if (isDashboard) {
    // Dashboards manage parameters themselves
    return ParametersList;
  }
  return isEmbeddingSdk ? ParametersList : SyncedParametersList;
}
