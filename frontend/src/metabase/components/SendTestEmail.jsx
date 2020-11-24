import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";

export default class SendTestEmail extends Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    isValid: PropTypes.bool,
    pulse: PropTypes.object.isRequired,
    testPulse: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  onTestPulseChannel(channel) {
    return this.props.testPulse({ ...this.props.pulse, channels: [channel] });
  }

  render() {
    const { isValid, channel } = this.props;
    return (
      <ActionButton
        actionFn={this.onTestPulseChannel.bind(this, channel)}
        disabled={!isValid}
        normalText={t`Send email now`}
        activeText={t`Sending…`}
        failedText={t`Sending failed`}
        successText={t`Pulse sent`}
        forceActiveStyle={true}
      />
    );
  }
}
