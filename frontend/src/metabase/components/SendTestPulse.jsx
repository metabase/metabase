import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";

export default class SendTestPulse extends Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    pulse: PropTypes.object.isRequired,
    testPulse: PropTypes.func.isRequired,
    normalText: PropTypes.string.isRequired,
    successText: PropTypes.string.isRequired,
  };
  static defaultProps = {};

  onTestPulseChannel = () => {
    const { pulse, channel, testPulse } = this.props;
    return testPulse({ ...pulse, channels: [channel] });
  };

  render() {
    const { channel, normalText, successText } = this.props;

    let disabled;
    if (channel.channel_type === "email") {
      disabled = channel.recipients.length === 0;
    } else if (channel.channel_type === "slack") {
      disabled = channel.details.channel === undefined;
    }

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
