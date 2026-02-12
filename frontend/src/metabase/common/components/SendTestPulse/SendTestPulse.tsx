import { useCallback } from "react";
import { t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import { cleanPulse } from "metabase/lib/pulse";
import type { Channel, ChannelSpecs } from "metabase-types/api";
import type { DashboardSubscriptionData } from "metabase-types/store";

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
