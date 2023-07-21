import { createRef, Fragment, Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import MarginHostingCTA from "metabase/admin/settings/components/widgets/MarginHostingCTA";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { getIsPaidPlan, getSetting } from "metabase/selectors/settings";

import {
  sendTestEmail,
  updateEmailSettings,
  clearEmailSettings,
} from "../settings";
import { SettingsSection } from "../app/components/SettingsEditor/SettingsSection";
import SettingsBatchForm from "./SettingsBatchForm";
import { EmailFormRoot } from "./SettingsEmailForm.styled";
import SectionDivider from "./widgets/SectionDivider";

const SEND_TEST_BUTTON_STATES = {
  default: t`Send test email`,
  working: t`Sending...`,
  success: t`Sent!`,
};

class SettingsEmailForm extends Component {
  state = {
    sendingEmail: "default",
  };

  static propTypes = {
    elements: PropTypes.array.isRequired,
    isPaidPlan: PropTypes.bool,
    isHosted: PropTypes.bool,
    sendTestEmail: PropTypes.func.isRequired,
    updateEmailSettings: PropTypes.func.isRequired,
    clearEmailSettings: PropTypes.func.isRequired,
    settingValues: PropTypes.object,
    derivedSettingValues: PropTypes.object,
    updateSetting: PropTypes.func,
    onChangeSetting: PropTypes.func,
    reloadSettings: PropTypes.func,
  };

  constructor(props, context) {
    super(props, context);

    this.formRef = createRef();
  }

  clearEmailSettings = async () => {
    await this.props.clearEmailSettings();
    // NOTE: reaching into form component is not ideal
    this.formRef.current.setState({ formData: {}, dirty: false });
  };

  sendTestEmail = async e => {
    e.preventDefault();

    this.setState({ sendingEmail: "working" });
    // NOTE: reaching into form component is not ideal
    this.formRef.current.setFormErrors(null);

    try {
      await this.props.sendTestEmail();
      this.setState({ sendingEmail: "success" });
      MetabaseAnalytics.trackStructEvent(
        "Email Settings",
        "Test Email",
        "success",
      );

      // show a confirmation for 3 seconds, then return to normal
      setTimeout(() => this.setState({ sendingEmail: "default" }), 3000);
    } catch (error) {
      MetabaseAnalytics.trackStructEvent(
        "Email Settings",
        "Test Email",
        "error",
      );
      this.setState({ sendingEmail: "default" });
      // NOTE: reaching into form component is not ideal
      this.formRef.current.setFormErrors(
        this.formRef.current.handleFormErrors(error),
      );
    }
  };

  render() {
    const { sendingEmail } = this.state;
    const { elements, isHosted, isPaidPlan } = this.props;

    const smtpIndex = elements.findIndex(
      ({ key }) => key === "email-smtp-password",
    );
    const smtpElements = elements
      .slice(0, smtpIndex + 1)
      .filter(setting => !setting.getHidden?.());
    const otherElements = elements
      .slice(smtpIndex + 1)
      .filter(setting => !setting.getHidden?.());

    return (
      <>
        {!isHosted && (
          <>
            <EmailFormRoot>
              <SettingsBatchForm
                ref={this.formRef}
                {...this.props}
                elements={smtpElements}
                updateSettings={this.props.updateEmailSettings}
                disable={sendingEmail !== "default"}
                renderExtraButtons={({
                  disabled,
                  valid,
                  pristine,
                  submitting,
                }) => (
                  <Fragment>
                    {valid && pristine && submitting === "default" ? (
                      <Button
                        className="mr1"
                        success={sendingEmail === "success"}
                        disabled={disabled}
                        onClick={this.sendTestEmail}
                      >
                        {SEND_TEST_BUTTON_STATES[sendingEmail]}
                      </Button>
                    ) : null}
                    <Button
                      className="mr1"
                      disabled={disabled}
                      onClick={() => this.clearEmailSettings()}
                    >
                      {t`Clear`}
                    </Button>
                  </Fragment>
                )}
              />
              {!isPaidPlan && (
                <MarginHostingCTA
                  tagline={t`Have your email configured for you.`}
                />
              )}
            </EmailFormRoot>
            <SectionDivider />
          </>
        )}
        <SettingsSection
          settingElements={otherElements}
          settingValues={this.props.settingValues}
          derivedSettingValues={this.props.derivedSettingValues}
          updateSetting={this.props.updateSetting}
          onChangeSetting={this.props.updateSetting}
          reloadSettings={this.props.reloadSettings}
        />
      </>
    );
  }
}

const mapStateToProps = state => ({
  isPaidPlan: getIsPaidPlan(state),
  isHosted: getSetting(state, "is-hosted"),
});

const mapDispatchToProps = {
  sendTestEmail,
  updateEmailSettings,
  clearEmailSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(SettingsEmailForm);
