import React, { useCallback, Component, useState } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "ttag";

import AuthProviderButton from "metabase/auth/components/AuthProviderButton";

import Settings from "metabase/lib/settings";

import { loginGoogle } from "metabase/auth/auth";
import { GoogleLogin } from "@react-oauth/google";

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
  }

  render() {
    const { errorMessage } = this.state;
    const { loginGoogle, location } = this.props;
    return (
      <div>
        <GoogleLogin
          useOneTap
          onSuccess={credentialResponse => {
            loginGoogle(
              credentialResponse.credential,
              location.query.redirect,
            );
          }}
          onError={() => {
            console.log('Login Failed');
          }}
        />
        {errorMessage && (
          <div className="bg-error p1 rounded text-white text-bold mt3">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }
}
