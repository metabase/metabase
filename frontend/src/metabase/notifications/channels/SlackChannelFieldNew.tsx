import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { MultiSelect } from "metabase/ui";
import type { ChannelSpec, NotificationHandlerSlack } from "metabase-types/api";

const CHANNEL_FIELD_NAME = "channel";
const CHANNEL_PREFIX = "#";
const USER_PREFIX = "@";

interface SlackChannelFieldProps {
  channel: NotificationHandlerSlack;
  channelSpec: ChannelSpec;
  onChange: (newConfig: NotificationHandlerSlack) => void;
}

// TODO: this is used for new Notifications. Unify this with SlackChannelField
export const SlackChannelFieldNew = ({
  channel,
  channelSpec,
  onChange,
}: SlackChannelFieldProps) => {
  const channelField = channelSpec.fields?.find(
    (field) => field.name === CHANNEL_FIELD_NAME,
  );

  const value = useMemo(
    () => channel.recipients.map((r) => r.details.value),
    [channel],
  );

  const updateChannel = useCallback(
    (value: string[]) => {
      onChange({
        ...channel,
        recipients: value.map((v) => ({
          type: "notification-recipient/raw-value",
          details: {
            value: v,
          },
        })),
      });
    },
    [channel, onChange],
  );

  const handleBlur = useCallback(() => {
    const formattedValues = value.map((v) => {
      if (v.startsWith(USER_PREFIX)) {
        return v;
      }
      if (v.startsWith(CHANNEL_PREFIX)) {
        return v;
      }
      return `${CHANNEL_PREFIX}${v}`;
    });

    updateChannel(formattedValues);
  }, [updateChannel, value]);

  const applicationName = useSelector(getApplicationName);

  return (
    <div>
      <MultiSelect
        multiple
        searchable
        hidePickedOptions
        data={channelField?.options || []}
        value={value}
        placeholder={t`Pick a user or channel...`}
        limit={300}
        styles={{
          input: {
            paddingRight: "0.25rem",
          },
          section: {
            display: "none",
          },
        }}
        onBlur={handleBlur}
        onChange={updateChannel}
        nothingFoundMessage={t`In order to send subscriptions and alerts to private Slack channels, you must first add the ${applicationName} bot to them.`}
      />
    </div>
  );
};
