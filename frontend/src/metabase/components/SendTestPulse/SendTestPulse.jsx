import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import { cleanPulse } from "metabase/lib/pulse";

export default class SendTestPulse extends Component {
  static propTypes = {
    channel: PropTypes.object.isRequired,
    channelSpecs: PropTypes.object.isRequired,
    pulse: PropTypes.object.isRequired,
    testPulse: PropTypes.func.isRequired,
    disabled: PropTypes.bool.isRequired,
    normalText: PropTypes.string.isRequired,
    successText: PropTypes.string.isRequired,
  };
  static defaultProps = {};

  onTestPulseChannel = () => {
    const { pulse, channel, channelSpecs, testPulse } = this.props;
    const channelPulse = { ...pulse, channels: [channel] };
    const cleanedPulse = cleanPulse(channelPulse, channelSpecs);

    return testPulse(cleanedPulse);
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
