import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  findChannelId,
  getDisplayNames,
} from "metabase/notifications/channels/utils";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Autocomplete } from "metabase/ui";
import type { Channel, ChannelSpec } from "metabase-types/api";

const CHANNEL_FIELD_NAME = "channel";
const CHANNEL_PREFIX = "#";
const USER_PREFIX = "@";

const ALLOWED_PREFIXES = [CHANNEL_PREFIX, USER_PREFIX];

interface SlackChannelFieldProps {
  channel: Channel;
  channelSpec: ChannelSpec;
  onChannelPropertyChange: (
    key: string,
    value: Record<string, string | boolean>,
  ) => void;
}

export const SlackChannelField = ({
  channel,
  channelSpec,
  onChannelPropertyChange,
}: SlackChannelFieldProps) => {
  const [hasPrivateChannelWarning, setHasPrivateChannelWarning] =
    useState(false);

  const channelField = channelSpec.fields?.find(
    (field) => field.name === CHANNEL_FIELD_NAME,
  );
  const slackOptions = channelField?.options ?? [];
  const displayNames = getDisplayNames(slackOptions);
  const value = String(channel?.details?.[CHANNEL_FIELD_NAME] ?? "");

  const updateChannel = (value: string) => {
    const { channel_id: _, ...restDetails } = channel.details ?? {};
    const newChannelId = findChannelId(slackOptions, value);
    onChannelPropertyChange("details", {
      ...restDetails,
      [CHANNEL_FIELD_NAME]: value,
      ...(newChannelId && { channel_id: newChannelId }),
    });
  };

  const handleChange = (value: string) => {
    updateChannel(value);
    setHasPrivateChannelWarning(false);
  };

  const handleBlur = () => {
    const shouldAddPrefix =
      value.length > 0 && !ALLOWED_PREFIXES.includes(value[0]);
    const fullChannelName = shouldAddPrefix
      ? `${CHANNEL_PREFIX}${value}`
      : value;

    if (shouldAddPrefix) {
      updateChannel(fullChannelName);
    }

    const isPrivate = value.trim().length > 0 && !displayNames.includes(value);

    setHasPrivateChannelWarning(isPrivate);
  };

  const applicationName = useSelector(getApplicationName);

  return (
    <div>
      <span className={cx(CS.block, CS.textBold, CS.pb2)}>
        {channelField?.displayName}
      </span>
      <Autocomplete
        data={displayNames}
        value={value}
        placeholder={t`Pick a user or channel...`}
        limit={300}
        onBlur={handleBlur}
        onChange={handleChange}
      />
      {hasPrivateChannelWarning && (
        <div
          className={CS.mt1}
        >{t`In order to send subscriptions and alerts to private Slack channels, you must first add the ${applicationName} bot to them.`}</div>
      )}
    </div>
  );
};
