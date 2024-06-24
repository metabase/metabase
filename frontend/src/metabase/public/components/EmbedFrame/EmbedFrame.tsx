import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import {
  FixedWidthContainer,
  ParametersFixedWidthContainer,
} from "metabase/dashboard/components/Dashboard/Dashboard.styled";
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
}>;

type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type EmbedFrameProps = EmbedFrameBaseProps &
  WithRequired<DashboardUrlHashOptions, "background">;

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
  background,
  bordered,
  titled,
  theme,
  hide_parameters,
  hide_download_button,
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

    document.addEventListener("scroll", handleScroll, { passive: true });

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

  return (
    <Root
      hasScroll={hasFrameScroll}
      isBordered={bordered}
      className={cx(
        EmbedFrameS.EmbedFrame,
        className,
        EMBED_THEME_CLASSES(theme),
        {
          [EmbedFrameS.NoBackground]: !background,
        },
      )}
      data-testid="embed-frame"
      data-embed-theme={theme}
    >
      <ContentContainer>
        {hasHeader && (
          <Header
            className={EmbedFrameS.EmbedFrameHeader}
            data-testid="embed-frame-header"
          >
            {finalName && (
              <TitleAndDescriptionContainer>
                <FixedWidthContainer
                  data-testid="fixed-width-dashboard-header"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  <TitleAndDescription
                    title={finalName}
                    description={description}
                    className={CS.my2}
                  />
                </FixedWidthContainer>
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
