import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { Flex } from "grid-styled";

import Button from "metabase/components/Button";
import MarginHostingCTA from "metabase/admin/settings/components/widgets/MarginHostingCTA";

import SettingsBatchForm from "./SettingsBatchForm";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import {
  sendTestEmail,
  updateEmailSettings,
  clearEmailSettings,
} from "../settings";

const SEND_TEST_BUTTON_STATES = {
  default: t`Send test email`,
  working: t`Sending...`,
  success: t`Sent!`,
};

@connect(
  null,
  { sendTestEmail, updateEmailSettings, clearEmailSettings },
)
export default class SettingsEmailForm extends Component {
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
      <Flex justifyContent="space-between">
        <SettingsBatchForm
          ref={form => (this._form = form && form.getWrappedInstance())}
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
        {!MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise() && (
          <MarginHostingCTA tagline={t`Have your email configured for you.`} />
        )}
      </Flex>
    );
  }
}
