/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { withRouter } from "react-router";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";

import MetabaseSettings from "metabase/lib/settings";
import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

import cx from "classnames";

import "./EmbedFrame.css";
import PublicFooter from "metabase/public/components/PublicFooter";
import { PublicNavbar } from "metabase/nav/containers/PublicNavbar";

const DEFAULT_OPTIONS = {
  bordered: IFRAMED,
  titled: true,
};
const SOLANA_DASHBOARD_ID = "a111b496-1c4a-400f-8566-a42e7fdbd173";
const ETH_DASHBOARD_ID = "10538a2c-07f3-4a5d-a992-425df0060380";
const HOME_DASHBOARD_ID = "1d797208-ea63-4c7b-b276-dc68315bc705";
const PODIUM_DASHBOARD_ID = "bede377c-52e4-4987-b683-73746905e58e";

class EmbedFrame extends Component {
  state = {
    innerScroll: true,
    publicNavPaths: [
      {
        key: "home",
        name: "Home",
        path: `/public/dashboard/${HOME_DASHBOARD_ID}`,
      },
      {
        key: "eth",
        name: "Ethereum",
        path: `/public/dashboard/${ETH_DASHBOARD_ID}`,
      },
      {
        key: "sol",
        name: "Solana",
        path: `/public/dashboard/${SOLANA_DASHBOARD_ID}`,
      },
      {
        key: "pod",
        name: "Podium",
        path: `/public/dashboard/${PODIUM_DASHBOARD_ID}`,
      },
    ],
  };

  UNSAFE_componentWillMount() {
    initializeIframeResizer(() => {
      this.setState({
        innerScroll: false,
      });
    });
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
          publicNavPaths={this.state.publicNavPaths}
        />
        {showFooter && (
          <div className="EmbedFrame-footer p1 md-p2 lg-p3 border-top flex-no-shrink flex align-center">
            {name || parameters?.length > 0 ? (
              <div className="EmbedFrame-header ">
                {name && (
                  <TitleAndDescription
                    title={name}
                    description={description}
                    className="my2"
                  />
                )}
                {parameters?.length > 0 ? (
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
                ) : null}
              </div>
            ) : null}
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
