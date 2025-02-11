import { useState } from "react";
import { t } from "ttag";

import TextArea from "metabase/core/components/TextArea";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Autocomplete } from "metabase/ui";
import type { ChannelSpec, NotificationHandlerSlack } from "metabase-types/api";

const CHANNEL_FIELD_NAME = "channel";
const CHANNEL_PREFIX = "#";
const USER_PREFIX = "@";

const ALLOWED_PREFIXES = [CHANNEL_PREFIX, USER_PREFIX];

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
  const [hasPrivateChannelWarning, setHasPrivateChannelWarning] =
    useState(false);
  const [template, setTemplate] = useState("");

  const channelField = channelSpec.fields?.find(
    field => field.name === CHANNEL_FIELD_NAME,
  );
  const value = channel.recipients[0]?.details.value ?? "";

  const updateChannel = (value: string) => {
    onChange({
      ...channel,
      recipients: [
        {
          type: "notification-recipient/raw-value",
          details: {
            value,
          },
        },
      ],
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

    const isPrivate =
      value.trim().length > 0 && !channelField?.options?.includes(value);

    setHasPrivateChannelWarning(isPrivate);
  };

  const handleTemplateChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newTemplate = event.target.value;
    setTemplate(newTemplate);
    onChange({
      ...channel,
      recipients: [
        {
          type: "notification-recipient/raw-value",
          details: {
            value: value,
          },
        },
      ],
      template: {
        name: "Slack Template",
        channel_type: "channel/slack",
        details: {
          type: "email/handlebars-text",
          body: newTemplate,
        },
      },
    });
  };

  const applicationName = useSelector(getApplicationName);

  return (
    <div>
      <Autocomplete
        data={channelField?.options || []}
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
      <div className={CS.mt2}>
        <TextArea
          value={template}
          onChange={handleTemplateChange}
          placeholder={t`Your handlebars template here...`}
          fullWidth
          rows={4}
        />
      </div>
    </div>
  );
};
