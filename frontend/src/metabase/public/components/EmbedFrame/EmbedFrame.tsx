import React, { useState } from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";
import type { Location } from "history";

import TitleAndDescription from "metabase/components/TitleAndDescription";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { getSetting } from "metabase/selectors/settings";
import { isWithinIframe, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import LogoBadge from "./LogoBadge";
import {
  Root,
  ContentContainer,
  Header,
  Body,
  Footer,
  ActionButtonsContainer,
} from "./EmbedFrame.styled";
import "./EmbedFrame.css";

interface OwnProps {
  className?: string;
  name?: string;
  description?: string;
  question?: Question;
  dashboard?: Dashboard;
  actionButtons?: JSX.Element[];
  parameters?: Parameter[];
  parameterValues?: Record<ParameterId, ParameterValueOrArray>;
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
  location,
  hasEmbedBranding,
  parameters,
  parameterValues,
  setParameterValue,
}: Props) {
  const [hasInnerScroll, setInnerScroll] = useState(true);

  useOnMount(() => {
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
              <div className="flex">
                <SyncedParametersList
                  className="mt1"
                  question={question}
                  dashboard={dashboard}
                  parameters={getValuePopulatedParameters(
                    parameters,
                    parameterValues,
                  )}
                  setParameterValue={setParameterValue}
                  hideParameters={hide_parameters}
                />
              </div>
            )}
          </Header>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {showFooter && (
        <Footer className="EmbedFrame-footer">
          {hasEmbedBranding && <LogoBadge dark={theme === "night"} />}
          {actionButtons && (
            <ActionButtonsContainer>{actionButtons}</ActionButtonsContainer>
          )}
        </Footer>
      )}
    </Root>
  );
}

export default _.compose(connect(mapStateToProps), withRouter)(EmbedFrame);
