/* eslint-disable react/prop-types */
import React from "react";

import { IFRAMED } from "metabase/lib/dom";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import AuthProviderButton from "metabase/auth/components/AuthProviderButton";

export default class SSOButton extends React.Component {
  UNSAFE_componentWillMount() {
    // If we're iframed and immediately simulate a click
    if (IFRAMED) {
      this.handleClick();
    }
  }

  handleClick = () => {
    const { redirect } = this.props.location.query;
    MetabaseAnalytics.trackEvent("Auth", "SSO Login Start");
    // use `window.location` instead of `push` since it's not a frontend route
    window.location =
      MetabaseSettings.get("site-url") +
      "/auth/sso" +
      (redirect ? "?redirect=" + encodeURIComponent(redirect) : "");
  };

  render() {
    return <AuthProviderButton {...this.props} onClick={this.handleClick} />;
  }
}
