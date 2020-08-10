import React, { Component } from "react";

import { t } from "ttag";
import AuthScene from "../components/AuthScene";
import BackToLogin from "../components/BackToLogin";
import Form from "metabase/containers/Form";
import LogoIcon from "metabase/components/LogoIcon";
import Icon from "metabase/components/Icon";

import MetabaseSettings from "metabase/lib/settings";
import validate from "metabase/lib/validate";

import { SessionApi } from "metabase/services";

export default class ForgotPasswordApp extends Component {
  state = {
    sentNotification: false,
  };

  handleSubmit = async values => {
    await SessionApi.forgot_password(values);
    this.setState({ sentNotification: true });
  };

  render() {
    const { location } = this.props;
    const { sentNotification } = this.state;
    const emailConfigured = MetabaseSettings.isEmailConfigured();

    return (
      <div className="full-height flex flex-column flex-full md-layout-centered">
        <div className="Login-wrapper wrapper Grid Grid--full md-Grid--1of2 relative z2">
          <div className="Grid-cell flex layout-centered text-brand">
            <LogoIcon className="Logo my4 sm-my0" height={65} />
          </div>
          {!emailConfigured ? (
            <div className="Grid-cell">
              <div className="text-centered bg-white bordered rounded shadowed p4">
                <h3 className="my4">{t`Please contact an administrator to have them reset your password`}</h3>
                <BackToLogin />
              </div>
            </div>
          ) : (
            <div className="Grid-cell">
              {!sentNotification ? (
                <div className="bg-white bordered rounded shadowed p4">
                  <h3 className="Login-header mb3">{t`Forgot password`}</h3>
                  <Form
                    form={{
                      fields: [
                        {
                          name: "email",
                          title: t`Email address`,
                          placeholder: t`The email you use for your Metabase account`,
                          validate: validate.email(),
                        },
                      ],
                    }}
                    initialValues={{ email: location.query.email }}
                    onSubmit={this.handleSubmit}
                    submitTitle={t`Send password reset email`}
                  />
                </div>
              ) : (
                <div>
                  <div className="SuccessGroup bg-white bordered rounded shadowed">
                    <div className="SuccessMark">
                      <Icon name="check" />
                    </div>
                    <p className="SuccessText">{t`Check your email for instructions on how to reset your password.`}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <AuthScene />
      </div>
    );
  }
}
