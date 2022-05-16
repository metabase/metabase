/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { withRouter } from "react-router";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import MetabaseSettings from "metabase/lib/settings";
import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import LogoBadge from "./LogoBadge";

import cx from "classnames";

import "./EmbedFrame.css";

const DEFAULT_OPTIONS = {
  bordered: IFRAMED,
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

    const showFooter = !MetabaseSettings.hideEmbedBranding() || actionButtons;

    const { bordered, titled, theme, hide_parameters } = {
      ...DEFAULT_OPTIONS,
      ...parseHashOptions(location.hash),
    };

    const name = titled ? this.props.name : null;

    return (
      <div
        className={cx("EmbedFrame flex flex-column", className, {
          spread: innerScroll,
          "bordered rounded shadowed": bordered,
          [`Theme--${theme}`]: !!theme,
        })}
      >
        <div
          className={cx("flex flex-column flex-full relative", {
            "scroll-y": innerScroll,
          })}
        >
          {name || (parameters && parameters.length > 0) ? (
            <div className="EmbedFrame-header flex align-center p1 sm-p2 lg-p3">
              {name && (
                <TitleAndDescription title={name} description={description} />
              )}
              {parameters && parameters.length > 0 ? (
                <div className="flex ml-auto">
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
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-column relative full flex-full">
            {children}
          </div>
        </div>
        {showFooter && (
          <div className="EmbedFrame-footer p1 md-p2 lg-p3 border-top flex-no-shrink flex align-center">
            {!MetabaseSettings.hideEmbedBranding() && (
              <LogoBadge dark={theme} />
            )}
            {actionButtons && (
              <div className="flex-align-right text-medium">
                {actionButtons}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}

export default withRouter(EmbedFrame);
