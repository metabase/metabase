import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { Flex, Box } from "grid-styled";

import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

import SettingsBatchForm from "./SettingsBatchForm";

import MetabaseAnalytics from "metabase/lib/analytics";

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
        <div
          className="border-left border-brand text-brand px4"
          style={{ height: 172 }}
        >
          <Icon name="cloud" size={48} style={{ color: "#B9D8F4" }} />
          <div className="pb3">
            <Text className="text-brand mb0">{t`Have your email configured for you.`}</Text>
            <Text className="text-brand text-bold">{t`Migrate to Metabase Cloud.`}</Text>
          </div>

          <ExternalLink
            className="bordered rounded border-brand bg-brand-hover text-white-hover px2 py1 text-bold text-center"
            href={"https://www.metabase.com/migrate/from/selfhosted"}
            target="_blank"
          >
            {t`Learn more`}
          </ExternalLink>
        </div>
      </Flex>
    );
  }
}
