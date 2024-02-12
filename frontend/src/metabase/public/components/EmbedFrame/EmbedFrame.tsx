import cx from "classnames";
import type { Location } from "history";
import type * as React from "react";
import { useState } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { useMount } from "react-use";
import _ from "underscore";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe, initializeIframeResizer } from "metabase/lib/dom";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { getSetting } from "metabase/selectors/settings";
import type Question from "metabase-lib/Question";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";
import type {
  Dashboard,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { FooterVariant } from "./EmbedFrame.styled";
import {
  Root,
  ContentContainer,
  Header,
  Body,
  ParametersWidgetContainer,
  Footer,
  ActionButtonsContainer,
} from "./EmbedFrame.styled";
import LogoBadge from "./LogoBadge";
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
  setParameterValue?: (parameterId: ParameterId, value: any) => void;
  children: React.ReactNode;
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
  footerVariant = "default",
  location,
  hasEmbedBranding,
  parameters,
  parameterValues,
  draftParameterValues,
  setParameterValue,
}: Props) {
  const [hasInnerScroll, setInnerScroll] = useState(true);

  useMount(() => {
    initializeIframeResizer(() => setInnerScroll(false));
  });

  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash) as HashOptions;

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
              <TitleAndDescription
                title={finalName}
                description={description}
                className="my2"
              />
            )}
            {hasParameters && (
              <ParametersWidgetContainer data-testid="dashboard-parameters-widget-container">
                <SyncedParametersList
                  className="mt1"
                  question={question}
                  dashboard={dashboard}
                  parameters={getValuePopulatedParameters(
                    parameters,
                    _.isEmpty(draftParameterValues)
                      ? parameterValues
                      : draftParameterValues,
                  )}
                  setParameterValue={setParameterValue}
                  hideParameters={hide_parameters}
                />
                {dashboard && <FilterApplyButton />}
              </ParametersWidgetContainer>
            )}
          </Header>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {showFooter && (
        <Footer className="EmbedFrame-footer" variant={footerVariant}>
          {hasEmbedBranding && (
            <div className="flex align-center">
              <LogoBadge variant={footerVariant} dark={theme === "night"} />
              <ExternalLink
                href="https://dadosfera.ai"
                target="_blank"
                className="h4 flex text-bold align-center no-decoration"
              >
                <span className="text-small">
                  <span className="ml2 md-ml2 text-medium">
                    / Accelerated By{" "}
                    <span className={theme ? "text-white" : "text-brand"}>
                      Dadosfera
                    </span>
                  </span>
                </span>
              </ExternalLink>
            </div>
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
