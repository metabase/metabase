import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import AuthProviderButton from "metabase/auth/components/AuthProviderButton";

import Settings from "metabase/lib/settings";

import { loginGoogle } from "metabase/auth/auth";

@connect(
  null,
  { loginGoogle },
)
export default class GoogleButton extends Component {
  componentDidMount() {
    const { loginGoogle, location } = this.props;
    const element = ReactDOM.findDOMNode(this);
    function attachGoogleAuth() {
      // if gapi isn't loaded yet then wait 100ms and check again. Keep doing this until we're ready
      if (!window.gapi) {
        window.setTimeout(attachGoogleAuth, 100);
        return;
      }
      try {
        window.gapi.load("auth2", () => {
          const auth2 = window.gapi.auth2.init({
            client_id: Settings.get("google_auth_client_id"),
            cookiepolicy: "single_host_origin",
          });
          auth2.attachClickHandler(
            element,
            {},
            googleUser => loginGoogle(googleUser, location.query.redirect),
            error => console.error("There was an error logging in", error),
          );
        });
      } catch (error) {
        console.error("Error attaching Google Auth handler: ", error);
      }
    }
    attachGoogleAuth();
  }

  render() {
    return <AuthProviderButton provider="google" />;
  }
}
