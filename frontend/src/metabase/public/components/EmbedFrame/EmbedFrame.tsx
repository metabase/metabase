import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { withRouter } from "react-router";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";
import type { Location } from "history";

import { useMount } from "react-use";
import TitleAndDescription from "metabase/components/TitleAndDescription";

import { getSetting } from "metabase/selectors/settings";
import { isWithinIframe, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";

import type {
  Dashboard,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { useDispatch } from "metabase/lib/redux";
import { setOptions } from "metabase/redux/embed";
import { FixedWidthContainer } from "metabase/dashboard/components/Dashboard/Dashboard.styled";
import type Question from "metabase-lib/Question";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import LogoBadge from "./LogoBadge";
import type { FooterVariant } from "./EmbedFrame.styled";
import {
  Root,
  ContentContainer,
  Header,
  Body,
  ParametersWidgetContainer,
  Footer,
  ActionButtonsContainer,
  TitleAndDescriptionContainer,
} from "./EmbedFrame.styled";
import "./EmbedFrame.css";

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
  theme?: string;
  hide_parameters?: string;
  hide_download_button?: boolean;
}

function mapStateToProps(state: State) {
  return {
    hasEmbedBranding: !getSetting(state, "hide-embed-branding?"),
  };
}

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
  const [hasInnerScroll, setInnerScroll] = useState(true);

  useMount(() => {
    initializeIframeResizer(() => setInnerScroll(false));
  });

  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setOptions(location));
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

  const hasHeader = Boolean(finalName || hasParameters);

  return (
    <Root
      hasScroll={hasInnerScroll}
      isBordered={bordered}
      className={cx("EmbedFrame", className, {
        [`Theme--${theme}`]: !!theme,
      })}
      data-testid="embed-frame"
    >
      <ContentContainer hasScroll={hasInnerScroll}>
        {hasHeader && (
          <Header className="EmbedFrame-header">
            {finalName && (
              <TitleAndDescriptionContainer>
                <TitleAndDescription
                  title={finalName}
                  description={description}
                  className="my2"
                />
              </TitleAndDescriptionContainer>
            )}
            {dashboardTabs}
            {hasParameters && (
              <ParametersWidgetContainer data-testid="dashboard-parameters-widget-container">
                <FixedWidthContainer
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
                </FixedWidthContainer>
              </ParametersWidgetContainer>
            )}
          </Header>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {showFooter && (
        <Footer className="EmbedFrame-footer" variant={footerVariant}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps), withRouter)(EmbedFrame);
