import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import AutocompleteInput from "metabase/core/components/AutocompleteInput";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { Channel, ChannelSpec } from "metabase-types/api";

const CHANNEL_FIELD_NAME = "channel";
const CHANNEL_PREFIX = "#";
const USER_PREFIX = "@";

const ALLOWED_PREFIXES = [CHANNEL_PREFIX, USER_PREFIX];

interface SlackChannelFieldProps {
  channel: Channel;
  channelSpec: ChannelSpec;
  onChannelPropertyChange: any;
}

const SlackChannelField = ({
  channel,
  channelSpec,
  onChannelPropertyChange,
}: SlackChannelFieldProps) => {
  const [hasPrivateChannelWarning, setHasPrivateChannelWarning] =
    useState(false);

  const channelField = channelSpec.fields.find(
    field => field.name === CHANNEL_FIELD_NAME,
  );
  const value = channel?.details?.[CHANNEL_FIELD_NAME] ?? "";

  const updateChannel = (value: string) =>
    onChannelPropertyChange("details", {
      ...channel.details,
      [CHANNEL_FIELD_NAME]: value,
    });

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

    const isPrivate =
      value.trim().length > 0 && !channelField?.options?.includes(value);

    setHasPrivateChannelWarning(isPrivate);
  };

  const applicationName = useSelector(getApplicationName);
  return (
    <div>
      <span className={cx(CS.block, CS.textBold, CS.pb2)}>
        {channelField?.displayName}
      </span>
      <AutocompleteInput
        placeholder={t`Pick a user or channel...`}
        value={value}
        options={channelField?.options}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackChannelField;
