import { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { getSetting } from "metabase/selectors/settings";
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
    const { elements, isHosted } = this.props;

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
});

export default connect(mapStateToProps)(SettingsEmailForm);
