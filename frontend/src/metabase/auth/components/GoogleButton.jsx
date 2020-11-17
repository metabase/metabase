import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "ttag";

import AuthProviderButton from "metabase/auth/components/AuthProviderButton";

import Settings from "metabase/lib/settings";

import { loginGoogle } from "metabase/auth/auth";

const GOOGLE_AUTH_ERRORS = {
  popup_closed_by_user: t`The window was closed before completing Google Authentication.`,
};

@connect(
  null,
  { loginGoogle },
)
export default class GoogleButton extends Component {
  constructor(props) {
    super(props);
    this.state = { errorMessage: null };
  }
  componentDidMount() {
    const { loginGoogle, location } = this.props;
    const element = ReactDOM.findDOMNode(this);
    const attachGoogleAuth = () => {
      // if gapi isn't loaded yet then wait 100ms and check again. Keep doing this until we're ready
      if (!window.gapi) {
        window.setTimeout(attachGoogleAuth, 100);
        return;
      }
      try {
        window.gapi.load("auth2", () => {
          const auth2 = window.gapi.auth2.init({
            client_id: Settings.get("google-auth-client-id"),
            cookiepolicy: "single_host_origin",
          });
          auth2.attachClickHandler(
            element,
            {},
            async googleUser => {
              this.setState({ errorMessage: null });
              const result = await loginGoogle(
                googleUser,
                location.query.redirect,
              );

              if (
                result.payload["status"] &&
                result.payload["status"] === 400 &&
                result.payload.data &&
                result.payload.data.errors
              ) {
                let errorMessage = "";
                for (const [, value] of Object.entries(
                  result.payload.data.errors,
                )) {
                  if (errorMessage !== "") {
                    errorMessage = errorMessage + "<br/>";
                  }
                  errorMessage = errorMessage + value;
                }
                this.setState({
                  errorMessage: errorMessage,
                });
              }
            },
            error => {
              this.setState({
                errorMessage:
                  GOOGLE_AUTH_ERRORS[error.error] ||
                  t`There was an issue signing in with Google. Please contact an administrator.`,
              });
            },
          );
        });
      } catch (error) {
        console.error("Error attaching Google Auth handler: ", error);
      }
    };
    attachGoogleAuth();
  }

  render() {
    const { errorMessage } = this.state;
    return (
      <div>
        <AuthProviderButton provider="google" />
        {errorMessage && (
          <div className="bg-error p1 rounded text-white text-bold mt3">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }
}
