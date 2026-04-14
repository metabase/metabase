import { useCallback } from "react";
import { t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import type { DashboardSubscriptionData } from "metabase/redux/store";
import { cleanPulse } from "metabase/utils/pulse";
import type { Channel, ChannelSpecs } from "metabase-types/api";

type SendTestPulseProps<T extends DashboardSubscriptionData> = {
  channel: Channel;
  channelSpecs: Partial<ChannelSpecs>;
  pulse: T;
  testPulse: (pulse: T) => Promise<unknown>;
  disabled: boolean;
  normalText: string;
  successText: string;
};

export function SendTestPulse<T extends DashboardSubscriptionData>({
  channel,
  channelSpecs,
  pulse,
  testPulse,
  disabled,
  normalText,
  successText,
}: SendTestPulseProps<T>): JSX.Element {
  const onTestPulseChannel = useCallback(() => {
    const channelPulse = { ...pulse, channels: [channel] };
    const cleanedPulse = cleanPulse(channelPulse, channelSpecs);

    return testPulse(cleanedPulse);
  }, [pulse, channel, channelSpecs, testPulse]);

  return (
    <ActionButton
      actionFn={onTestPulseChannel}
      disabled={disabled}
      normalText={normalText}
      activeText={t`Sending…`}
      failedText={t`Sending failed`}
      successText={successText}
    />
  );
}
