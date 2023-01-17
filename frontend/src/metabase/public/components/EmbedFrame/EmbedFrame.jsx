/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { withRouter } from "react-router";

import cx from "classnames";
import { isWithinIframe, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import MetabaseSettings from "metabase/lib/settings";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
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

const DEFAULT_OPTIONS = {
  bordered: isWithinIframe(),
  titled: true,
};

class EmbedFrame extends Component {
  state = {
    innerScroll: true,
  };

  UNSAFE_componentWillMount() {
    initializeIframeResizer(() => this.setState({ innerScroll: false }));
  }

  render() {
    const {
      className,
      children,
      description,
      actionButtons,
      location,
      parameters,
      parameterValues,
      setParameterValue,
    } = this.props;
    const { innerScroll } = this.state;

    const { bordered, titled, theme, hide_parameters, hide_download_button } = {
      ...DEFAULT_OPTIONS,
      ...parseHashOptions(location.hash),
    };
    const showFooter =
      !MetabaseSettings.hideEmbedBranding() ||
      (!hide_download_button && actionButtons);

    const name = titled ? this.props.name : null;
    const hasParameters = parameters?.length > 0;
    const hasHeader = Boolean(name || hasParameters);

    return (
      <Root
        hasScroll={innerScroll}
        isBordered={bordered}
        className={cx("EmbedFrame", className, {
          [`Theme--${theme}`]: !!theme,
        })}
      >
        <ContentContainer hasScroll={innerScroll}>
          {hasHeader && (
            <Header className="EmbedFrame-header">
              {name && (
                <TitleAndDescription
                  title={name}
                  description={description}
                  className="my2"
                />
              )}
              {hasParameters && (
                <div className="flex">
                  <SyncedParametersList
                    className="mt1"
                    dashboard={this.props.dashboard}
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
            {!MetabaseSettings.hideEmbedBranding() && (
              <LogoBadge dark={theme === "night"} />
            )}
            {actionButtons && (
              <ActionButtonsContainer>{actionButtons}</ActionButtonsContainer>
            )}
          </Footer>
        )}
      </Root>
    );
  }
}

export default withRouter(EmbedFrame);
