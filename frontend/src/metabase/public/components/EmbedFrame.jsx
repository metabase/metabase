/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { withRouter } from "react-router";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import MetabaseSettings from "metabase/lib/settings";

import cx from "classnames";

import "./EmbedFrame.css";
import PublicFooter from "metabase/public/components/PublicFooter";
import { PublicNavbar } from "metabase/nav/containers/PublicNavbar";

const DEFAULT_OPTIONS = {
  bordered: IFRAMED,
  titled: true,
};
const publicNvaPaths = [
  { key: "home", name: "Home", path: "/home" },
  { key: "eth", name: "Ethereum", path: "/home" },
  { key: "sol", name: "Solana", path: "/home" },
];
class EmbedFrame extends Component {
  state = {
    innerScroll: true,
  };

  UNSAFE_componentWillMount() {
    initializeIframeResizer(() => this.setState({ innerScroll: false }));
  }

  render() {
    const { className, children, actionButtons, location } = this.props;
    const { innerScroll } = this.state;

    const { bordered, theme, hide_download_button } = {
      ...DEFAULT_OPTIONS,
      ...parseHashOptions(location.hash),
    };
    const showFooter =
      !MetabaseSettings.hideEmbedBranding() ||
      (!hide_download_button && actionButtons);

    return (
      <div
        className={cx("EmbedFrame flex flex-column", className, {
          spread: innerScroll,
          "bordered rounded shadowed": bordered,
          [`Theme--${theme}`]: !!theme,
        })}
      >
        <PublicNavbar
          path={location.pathname}
          publicNavPaths={publicNvaPaths}
        />
        {showFooter && (
          <div className="EmbedFrame-footer p1 md-p2 lg-p3 border-top flex-no-shrink flex align-center">
            {actionButtons && (
              <div className="flex-align-right text-medium">
                {actionButtons}
              </div>
            )}
          </div>
        )}
        <div
          className={cx("flex flex-column flex-full relative", {
            "scroll-y": innerScroll,
          })}
        >
          <div className="flex flex-column relative full flex-full">
            {children}
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }
}

export default withRouter(EmbedFrame);
