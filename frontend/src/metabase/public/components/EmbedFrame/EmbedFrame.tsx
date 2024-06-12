import cx from "classnames";
import type { JSX, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import {
  FixedWidthContainer,
  ParametersFixedWidthContainer,
} from "metabase/dashboard/components/Dashboard/Dashboard.styled";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { initializeIframeResizer, isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import {
  ParametersList,
  SyncedParametersList,
} from "metabase/parameters/components/ParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Icon } from "metabase/ui";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/visualizations/lib/save-chart-image";
import {
  exportTabAsPdfButtonText,
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
import ParameterValueWidgetS from "../../../parameters/components/ParameterValueWidget.module.css";

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
  actionButtons: JSX.Element | null;
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
}>;

export type EmbedFrameProps = EmbedFrameBaseProps & DashboardUrlHashOptions;
const EMBED_THEME_CLASSES = (theme: DashboardUrlHashOptions["theme"]) => {
  if (!theme) {
    return null;
  }

  if (theme === "night") {
    return cx(ParameterValueWidgetS.ThemeNight, EmbedFrameS.ThemeNight);
  }

  if (theme === "transparent") {
    return EmbedFrameS.ThemeTransparent;
  }
};

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
  bordered,
  titled,
  theme,
  hide_parameters,
  hide_download_button,
  // TODO: merge `downloads` with `hide_download_button` on the higher level component?
  downloads = true,
}: EmbedFrameProps) => {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const hasEmbedBranding = useSelector(
    state => !getSetting(state, "hide-embed-branding?"),
  );

  const ParametersListComponent = isEmbeddingSdk
    ? ParametersList
    : SyncedParametersList;

  const [hasFrameScroll, setHasFrameScroll] = useState(!isEmbeddingSdk);

  const [hasInnerScroll, setHasInnerScroll] = useState(
    document.documentElement.scrollTop > 0,
  );

  useMount(() => {
    initializeIframeResizer(() => setHasFrameScroll(false));
  });

  useEffect(() => {
    const handleScroll = () => {
      setHasInnerScroll(document.documentElement.scrollTop > 0);
    };

    document.addEventListener("scroll", handleScroll, {
      capture: false,
      passive: true,
    });

    return () => document.removeEventListener("scroll", handleScroll);
  }, []);

  const hideParameters = [hide_parameters, hiddenParameterSlugs]
    .filter(Boolean)
    .join(",");

  const showFooter =
    hasEmbedBranding || (!hide_download_button && actionButtons);

  const finalName = titled ? name : null;

  const hasParameters = Array.isArray(parameters) && parameters.length > 0;
  const visibleParameters = hasParameters
    ? getVisibleParameters(parameters, hideParameters)
    : [];
  const hasVisibleParameters = visibleParameters.length > 0;

  const hasHeader = Boolean(finalName || dashboardTabs);
  const isParameterPanelSticky =
    !!dashboard &&
    theme !== "transparent" && // https://github.com/metabase/metabase/pull/38766#discussion_r1491549200
    isParametersWidgetContainersSticky(visibleParameters.length);

  // TODO: pass this as headerActions  from PublicDashboard ?
  const saveAsPDF = async () => {
    const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
    await saveDashboardPdf(
      cardNodeSelector,
      name ?? t`Exported dashboard`,
    ).then(() => {
      // TODO: tracking
      // trackExportDashboardToPDF(dashboard.id);
    });
  };

  return (
    <Root
      hasScroll={hasFrameScroll}
      isBordered={bordered}
      className={cx(
        EmbedFrameS.EmbedFrame,
        className,
        EMBED_THEME_CLASSES(theme),
      )}
      data-testid="embed-frame"
      data-embed-theme={theme}
    >
      <ContentContainer id={DASHBOARD_PDF_EXPORT_ROOT_ID}>
        {hasHeader && (
          <Header
            className={cx(
              EmbedFrameS.EmbedFrameHeader,
              SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS,
            )}
            data-testid="embed-frame-header"
          >
            {(finalName || downloads) && (
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
                  {/* TODO: move this to a prop passed by PublicDashboard ? */}
                  {dashboard && downloads && (
                    <Button
                      variant="subtle"
                      leftIcon={<Icon name="document" />}
                      color="text-dark"
                      onClick={saveAsPDF}
                    >
                      {exportTabAsPdfButtonText(dashboard.tabs)}
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
        {hasVisibleParameters && (
          <ParametersWidgetContainer
            embedFrameTheme={theme}
            hasScroll={hasInnerScroll}
            isSticky={isParameterPanelSticky}
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
          {hasEmbedBranding && (
            <LogoBadge variant={footerVariant} dark={theme === "night"} />
          )}
          {actionButtons && (
            <ActionButtonsContainer>{actionButtons}</ActionButtonsContainer>
          )}
        </Footer>
      )}
    </Root>
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
