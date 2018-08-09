import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";

import Button from "metabase/components/Button";

import SettingsBatchForm from "./SettingsBatchForm";

import MetabaseAnalytics from "metabase/lib/analytics";

const SEND_TEST_BUTTON_STATES = {
  default: t`Send test email`,
  working: t`Sending...`,
  success: t`Sent!`,
};

export default class SettingsLdapForm extends Component {
  state = {
    sendingEmail: "default",
  };

  static propTypes = {
    elements: PropTypes.array.isRequired,
    sendTestEmail: PropTypes.func.isRequired,
    updateEmailSettings: PropTypes.func.isRequired,
    clearEmailSettings: PropTypes.func.isRequired,
  };

  clearEmailSettings = async () => {
    await this.props.clearEmailSettings();
    // NOTE: reaching into form component is not ideal
    this._form.setState({ formData: {}, dirty: false });
  };

  sendTestEmail = async e => {
    e.preventDefault();

    this.setState({ sendingEmail: "working" });
    // NOTE: reaching into form component is not ideal
    this._form.setFormErrors(null);

    try {
      await this.props.sendTestEmail();
      this.setState({ sendingEmail: "success" });
      MetabaseAnalytics.trackEvent("Email Settings", "Test Email", "success");

      // show a confirmation for 3 seconds, then return to normal
      setTimeout(() => this.setState({ sendingEmail: "default" }), 3000);
    } catch (error) {
      MetabaseAnalytics.trackEvent("Email Settings", "Test Email", "error");
      this.setState({ sendingEmail: "default" });
      // NOTE: reaching into form component is not ideal
      this._form.setFormErrors(this._form.handleFormErrors(error));
    }
  };

  render() {
    const { sendingEmail } = this.state;
    return (
      <SettingsBatchForm
        ref={form => (this._form = form)}
        {...this.props}
        updateSettings={this.props.updateEmailSettings}
        disable={sendingEmail !== "default"}
        renderExtraButtons={({ disabled, valid, dirty, submitting }) => {
          return [
            valid && !dirty && submitting === "default" ? (
              <Button
                mr={1}
                success={sendingEmail === "success"}
                disabled={disabled}
                onClick={this.sendTestEmail}
              >
                {SEND_TEST_BUTTON_STATES[sendingEmail]}
              </Button>
            ) : null,
            <Button
              mr={1}
              disabled={disabled}
              onClick={() => this.clearEmailSettings()}
            >
              {t`Clear`}
            </Button>,
          ];
        }}
      />
    );
  }
}
