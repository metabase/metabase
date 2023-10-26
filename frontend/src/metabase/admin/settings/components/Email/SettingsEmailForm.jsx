import { Component } from "react";
import { push } from "react-router-redux";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { getSetting } from "metabase/selectors/settings";
import { getIsEmailConfigured } from "metabase/setup/selectors";
import { SettingsSection } from "../../app/components/SettingsEditor/SettingsSection";
import { SMTPConnectionCard } from "./SMTPConnectionCard";

class SettingsEmailForm extends Component {
  static propTypes = {
    elements: PropTypes.array.isRequired,
    isEmailConfigured: PropTypes.bool,
    isHosted: PropTypes.bool,
    settingValues: PropTypes.object,
    derivedSettingValues: PropTypes.object,
    updateSetting: PropTypes.func,
    reloadSettings: PropTypes.func,
    push: PropTypes.func,
  };

  constructor(props, context) {
    super(props, context);
  }

  render() {
    const { elements, isHosted, isEmailConfigured, push } = this.props;

    if (!isHosted && !isEmailConfigured) {
      push("/admin/settings/email/smtp");
    }

    const settingElements = elements.filter(setting => !setting.getHidden?.());

    return (
      <>
        {!isHosted && <SMTPConnectionCard />}
        <SettingsSection
          settingElements={settingElements}
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
  isHosted: getSetting(state, "is-hosted"),
  isEmailConfigured: getIsEmailConfigured(state),
});

const mapDispatchToProps = {
  push,
};

export default connect(mapStateToProps, mapDispatchToProps)(SettingsEmailForm);
