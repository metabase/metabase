import type { ReactNode } from "react";
import { useState } from "react";

import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";

import { useMount } from "react-use";
import type { WithRouterProps } from "react-router/lib/withRouter";
import TitleAndDescription from "metabase/components/TitleAndDescription";

import { getSetting } from "metabase/selectors/settings";
import { initializeIframeResizer } from "metabase/lib/dom";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";

import type {
  Dashboard,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { SuperDuperEmbedOptions } from "metabase/public/components/EmbedFrame/types";
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
  embedOptions: SuperDuperEmbedOptions;
  hasAbsolutePositioning?: boolean;
}

type StateProps = {
  hasEmbedBranding: boolean;
};

type Props = OwnProps & StateProps & WithRouterProps;

function mapStateToProps(state: State): StateProps {
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
  embedOptions,
  hasEmbedBranding,
  parameters,
  parameterValues,
  draftParameterValues,
  hiddenParameterSlugs,
  setParameterValue,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
  hasAbsolutePositioning,
}: Props) {
  const [hasInnerScroll, setInnerScroll] = useState(true);

  useMount(() => {
    if (hasAbsolutePositioning) {
      initializeIframeResizer(() => setInnerScroll(false));
    } else {
      setInnerScroll(false);
    }
  });

  const {
    bordered = false,
    titled = !!name,
    theme = "transparent",
    hide_parameters = false,
    hide_download_button = false,
  } = embedOptions || {};

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
        // this footer
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
export default _.compose(connect(mapStateToProps))(EmbedFrame);
