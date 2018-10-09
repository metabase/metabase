/* @flow */

import React, { Component } from "react";
import { withRouter } from "react-router";

import { IFRAMED } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import MetabaseSettings from "metabase/lib/settings";

import Parameters from "metabase/parameters/components/Parameters";
import LogoBadge from "./LogoBadge";

import cx from "classnames";

import "./EmbedFrame.css";

const DEFAULT_OPTIONS = {
  bordered: IFRAMED,
  titled: true,
};

import type { Parameter } from "metabase/meta/types/Parameter";

type Props = {
  className?: string,
  children?: any,
  actionButtons?: any[],
  name?: string,
  description?: string,
  location: { query: { [key: string]: string }, hash: string },
  parameters?: Parameter[],
  parameterValues?: { [key: string]: string },
  setParameterValue: (id: string, value: string) => void,
};

type State = {
  innerScroll: boolean,
};

@withRouter
export default class EmbedFrame extends Component {
  props: Props;
  state: State = {
    innerScroll: true,
  };

  componentWillMount() {
    // Make iFrameResizer avaliable so that embed users can
    // have their embeds autosize to their content
    if (window.iFrameResizer) {
      console.error("iFrameResizer resizer already defined.");
    } else {
      window.iFrameResizer = {
        autoResize: true,
        heightCalculationMethod: "bodyScroll",
        readyCallback: () => {
          this.setState({ innerScroll: false });
        },
      };

      // FIXME: Crimes
      // This is needed so the FE test framework which runs in node
      // without the avaliability of require.ensure skips over this part
      // which is for external purposes only.
      //
      // Ideally that should happen in the test config, but it doesn't
      // seem to want to play nice when messing with require
      if (typeof require.ensure !== "function") {
        // $FlowFixMe: flow doesn't seem to like returning false here
        return false;
      }

      // Make iframe-resizer avaliable to the embed
      // We only care about contentWindow so require that minified file

      require.ensure([], require => {
        require("iframe-resizer/js/iframeResizer.contentWindow.min.js");
      });
    }
  }

  render() {
    const {
      className,
      children,
      actionButtons,
      location,
      parameters,
      parameterValues,
      setParameterValue,
    } = this.props;
    const { innerScroll } = this.state;

    const footer = true;

    const { bordered, titled, theme } = {
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
              {name && <div className="h4 text-bold sm-h3 md-h2">{name}</div>}
              {parameters && parameters.length > 0 ? (
                <div className="flex ml-auto">
                  <Parameters
                    parameters={parameters.map(p => ({
                      ...p,
                      value: parameterValues && parameterValues[p.id],
                    }))}
                    query={location.query}
                    setParameterValue={setParameterValue}
                    syncQueryString
                    isQB
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-column relative full flex-full">
            {children}
          </div>
        </div>
        {footer && (
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
