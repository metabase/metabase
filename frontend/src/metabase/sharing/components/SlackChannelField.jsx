import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import AutocompleteInput from "metabase/core/components/AutocompleteInput";

const getPrivateChannelWarning = () =>
  t`In order to send subscriptions and alerts to private Slack channels, you must first add the Metabase bot to them.`;

const CHANNEL_FIELD_NAME = "channel";
const CHANNEL_PREFIX = "#";
const USER_PREFIX = "@";

const ALLOWED_PREFIXES = [CHANNEL_PREFIX, USER_PREFIX];

function SlackChannelField({ channel, channelSpec, onChannelPropertyChange }) {
  const [warning, setWarning] = useState(null);

  const channelField = channelSpec.fields.find(
    field => field.name === CHANNEL_FIELD_NAME,
  );
  const value = channel?.details?.[CHANNEL_FIELD_NAME] ?? "";

  const updateChannel = value =>
    onChannelPropertyChange("details", {
      ...channel.details,
      [CHANNEL_FIELD_NAME]: value,
    });

  const handleChange = value => {
    updateChannel(value);
    setWarning(null);
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
      value.trim().length > 0 && !channelField.options.includes(value);

    if (isPrivate) {
      setWarning(getPrivateChannelWarning());
    }
  };

  return (
    <div>
      <span className="block text-bold pb2">{channelField.displayName}</span>
      <AutocompleteInput
        isFullWidth
        placeholder={t`Pick a user or channel...`}
        value={value}
        options={channelField.options}
        onBlur={handleBlur}
        onChange={handleChange}
      />
      {warning && <div className="mt1">{warning}</div>}
    </div>
  );
}

SlackChannelField.propTypes = {
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
};

export default SlackChannelField;
