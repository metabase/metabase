import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";

export default class SendTestPulse extends Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    pulse: PropTypes.object.isRequired,
    testPulse: PropTypes.func.isRequired,
    disabled: PropTypes.bool.isRequired,
    normalText: PropTypes.string.isRequired,
    successText: PropTypes.string.isRequired,
  };
  static defaultProps = {};

  onTestPulseChannel = () => {
    const { pulse, channel, testPulse } = this.props;
    return testPulse({ ...pulse, channels: [channel] });
  };

  render() {
    const { disabled, normalText, successText } = this.props;

    return (
      <ActionButton
        actionFn={this.onTestPulseChannel}
        disabled={disabled}
        normalText={normalText}
        activeText={t`Sending…`}
        failedText={t`Sending failed`}
        successText={successText}
        forceActiveStyle={true}
      />
    );
  }
}
