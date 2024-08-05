import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import {
  trackExportDashboardToPDF,
  type DashboardAccessedVia,
} from "metabase/dashboard/analytics";
import {
  FixedWidthContainer,
  ParametersFixedWidthContainer,
} from "metabase/dashboard/components/Dashboard/Dashboard.styled";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { initializeIframeResizer, isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import type { DisplayTheme } from "metabase/public/lib/types";
import { SyncedParametersList } from "metabase/query_builder/components/SyncedParametersList";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Icon } from "metabase/ui";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/visualizations/lib/save-chart-image";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
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
}: EmbedFrameProps) => {
  useGlobalTheme(theme);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const hasEmbedBranding = useSelector(
    state => !getSetting(state, "hide-embed-branding?"),
  );

  const ParametersListComponent = getParametersListComponent({
    isEmbeddingSdk,
    isDashboard: !!dashboard,
  });

  const [hasFrameScroll, setHasFrameScroll] = useState(!isEmbeddingSdk);

  useMount(() => {
    initializeIframeResizer(() => setHasFrameScroll(false));
  });

  const [isFilterSticky, intersectionObserverTargetRef] = useIsFiltersSticky();

  const hideParameters = [hide_parameters, hiddenParameterSlugs]
    .filter(Boolean)
    .join(",");

  const showFooter = hasEmbedBranding || (downloadsEnabled && actionButtons);

  const finalName = titled ? name : null;

  const hasParameters = Array.isArray(parameters) && parameters.length > 0;
  const visibleParameters = hasParameters
    ? getVisibleParameters(parameters, hideParameters)
    : [];
  const hasVisibleParameters = visibleParameters.length > 0;

  const hasHeader = Boolean(finalName || dashboardTabs) || downloadsEnabled;
  const canParameterPanelSticky =
    !!dashboard && isParametersWidgetContainersSticky(visibleParameters.length);

  const saveAsPDF = () => {
    const dashboardAccessedVia = match(dashboard?.id)
      .returnType<DashboardAccessedVia>()
      .when(isJWT, () => "static-embed")
      .when(isUuid, () => "public-link")
      .otherwise(() => "sdk-embed");

    trackExportDashboardToPDF({
      dashboardAccessedVia,
    });

    const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
    saveDashboardPdf(cardNodeSelector, name ?? t`Exported dashboard`);
  };

  return (
    <Root
      hasScroll={hasFrameScroll}
      isBordered={bordered}
      className={cx(EmbedFrameS.EmbedFrame, className, {
        [EmbedFrameS.NoBackground]: !background,
      })}
      data-testid="embed-frame"
      data-embed-theme={theme}
    >
      <ContentContainer
        id={DASHBOARD_PDF_EXPORT_ROOT_ID}
        className={EmbedFrameS.WithThemeBackground}
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
                    <Button
                      variant="subtle"
                      leftIcon={<Icon name="document" />}
                      color="brand"
                      onClick={saveAsPDF}
                    >
                      {getExportTabAsPdfButtonText(dashboard.tabs)}
                    </Button>
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
            <Separator />
          </Header>
        )}
        {/**
         * I put the target for IntersectionObserver right above the parameters container,
         * so that it detects when the parameters container is about to be sticky (is about
         * to go out of the viewport).
         */}
        <span ref={intersectionObserverTargetRef} />
        {hasVisibleParameters && (
          <ParametersWidgetContainer
            embedFrameTheme={theme}
            canSticky={canParameterPanelSticky}
            isSticky={isFilterSticky}
            data-testid="dashboard-parameters-widget-container"
          >
            <ParametersFixedWidthContainer
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
            </ParametersFixedWidthContainer>
          </ParametersWidgetContainer>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {showFooter && (
        <Footer
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

function useIsFiltersSticky() {
  const intersectionObserverTargetRef = useRef<HTMLElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    if (
      intersectionObserverTargetRef.current &&
      // Allow this hook in tests, since Node don't have access to some Browser APIs
      typeof IntersectionObserver !== "undefined"
    ) {
      const settings: IntersectionObserverInit = {
        threshold: 1,
      };
      const observer = new IntersectionObserver(([entry]) => {
        setIsSticky(entry.intersectionRatio < 1);
      }, settings);
      observer.observe(intersectionObserverTargetRef.current);

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  return [isSticky, intersectionObserverTargetRef] as const;
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
