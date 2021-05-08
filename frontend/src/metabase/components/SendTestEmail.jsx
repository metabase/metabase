import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";

export default class SendTestEmail extends Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    pulse: PropTypes.object.isRequired,
    testPulse: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  onTestPulseChannel = () => {
    const { pulse, channel, testPulse } = this.props;
    return testPulse({ ...pulse, channels: [channel] });
  };

  render() {
    const { channel } = this.props;
    return (
      <ActionButton
        actionFn={this.onTestPulseChannel}
        disabled={
          channel.channel_type === "email" && channel.recipients.length === 0
        }
        normalText={t`Send email now`}
        activeText={t`Sending…`}
        failedText={t`Sending failed`}
        successText={t`Email sent`}
        forceActiveStyle={true}
      />
    );
  }
}
