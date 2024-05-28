import cx from "classnames";
import type { Location } from "history";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { useMount } from "react-use";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CS from "metabase/css/core/index.css";
import {
  FixedWidthContainer,
  ParametersFixedWidthContainer,
} from "metabase/dashboard/components/Dashboard/Dashboard.styled";
import { parseHashOptions } from "metabase/lib/browser";
import {
  initializeIframeResizer,
  isSmallScreen,
  isWithinIframe,
} from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { setInitialUrlOptions } from "metabase/redux/embed";
import { getSetting } from "metabase/selectors/settings";
import type Question from "metabase-lib/v1/Question";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Dashboard,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

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

type ParameterValues = Record<ParameterId, ParameterValueOrArray>;

interface OwnProps {
  className?: string;
  name?: string;
  description?: string;
  question?: Question;
  dashboard?: Dashboard;
  actionButtons?: JSX.Element[];
  footerVariant?: FooterVariant;
  parameters?: Parameter[];
  parameterValues?: ParameterValues;
  draftParameterValues?: ParameterValues;
  hiddenParameterSlugs?: string;
  enableParameterRequiredBehavior?: boolean;
  setParameterValue?: (parameterId: ParameterId, value: any) => void;
  setParameterValueToDefault: (id: ParameterId) => void;
  children: ReactNode;
  dashboardTabs?: ReactNode;
}

interface StateProps {
  hasEmbedBranding: boolean;
}

type Props = OwnProps &
  StateProps & {
    location: Location;
  };

interface HashOptions {
  bordered?: boolean;
  titled?: boolean;
  theme?: "night" | "transparent";
  hide_parameters?: string;
  hide_download_button?: boolean;
}

function mapStateToProps(state: State) {
  return {
    hasEmbedBranding: !getSetting(state, "hide-embed-branding?"),
  };
}

const EMBED_THEME_CLASSES = (theme: HashOptions["theme"]) => {
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

function EmbedFrame({
  className,
  children,
  name,
  description,
  question,
  dashboard,
  actionButtons,
  dashboardTabs = null,
  footerVariant = "default",
  location,
  hasEmbedBranding,
  parameters,
  parameterValues,
  draftParameterValues,
  hiddenParameterSlugs,
  setParameterValue,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
}: Props) {
  const [hasFrameScroll, setHasFrameScroll] = useState(true);
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

  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setInitialUrlOptions(location));
  }, [dispatch, location]);

  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash) as HashOptions;

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
              <SyncedParametersList
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
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps), withRouter)(EmbedFrame);
