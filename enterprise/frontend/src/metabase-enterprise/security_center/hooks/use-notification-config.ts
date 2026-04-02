import { useCallback, useMemo, useState } from "react";

import {
  useGetChannelInfoQuery,
  useListUserRecipientsQuery,
  useUpdateSettingsMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import type {
  ChannelApiResponse,
  NotificationHandlerEmail,
  NotificationHandlerSlack,
  NotificationRecipient,
  User,
} from "metabase-types/api";

export interface NotificationConfig {
  email: {
    sendToAllAdmins: boolean;
    handler: NotificationHandlerEmail;
  };
  slack: {
    enabled: boolean;
    handler: NotificationHandlerSlack;
  };
}

const DEFAULT_EMAIL_HANDLER: NotificationHandlerEmail = {
  channel_type: "channel/email",
  recipients: [],
};

const DEFAULT_SLACK_HANDLER: NotificationHandlerSlack = {
  channel_type: "channel/slack",
  recipients: [],
};

function buildSlackHandler(
  channelName: string | null,
): NotificationHandlerSlack {
  if (!channelName) {
    return DEFAULT_SLACK_HANDLER;
  }
  return {
    channel_type: "channel/slack",
    recipients: [
      {
        type: "notification-recipient/raw-value",
        details: { value: channelName },
      },
    ],
  };
}

function configFromSettings(
  emailRecipients: NotificationRecipient[] | null,
  slackChannel: string | null,
): NotificationConfig {
  return {
    email: {
      sendToAllAdmins: emailRecipients === null,
      handler: emailRecipients
        ? { channel_type: "channel/email", recipients: emailRecipients }
        : DEFAULT_EMAIL_HANDLER,
    },
    slack: {
      enabled: slackChannel !== null,
      handler: buildSlackHandler(slackChannel),
    },
  };
}

/**
 * Hook for notification channel configuration.
 * Reads from and writes to Metabase settings via the generic settings API.
 */
export function useNotificationConfig() {
  const savedEmailRecipients = useSetting("security-center-email-recipients");
  const savedSlackChannel = useSetting("security-center-slack-channel");

  const initialConfig = useMemo(
    () => configFromSettings(savedEmailRecipients, savedSlackChannel),
    [savedEmailRecipients, savedSlackChannel],
  );

  const [config, setConfig] = useState<NotificationConfig>(initialConfig);

  const { data: userRecipients } = useListUserRecipientsQuery();
  const { data: channelInfo } = useGetChannelInfoQuery();
  const [updateSettings] = useUpdateSettingsMutation();

  const users: User[] = useMemo(
    () => userRecipients?.data ?? [],
    [userRecipients?.data],
  );
  const channels: ChannelApiResponse["channels"] | undefined =
    channelInfo?.channels;

  const updateEmailHandler = useCallback(
    (handler: NotificationHandlerEmail) => {
      setConfig((prev) => ({
        ...prev,
        email: { ...prev.email, handler },
      }));
    },
    [],
  );

  const toggleSendToAllAdmins = useCallback((sendToAllAdmins: boolean) => {
    setConfig((prev) => ({
      ...prev,
      email: { ...prev.email, sendToAllAdmins },
    }));
  }, []);

  const updateSlackHandler = useCallback(
    (handler: NotificationHandlerSlack) => {
      setConfig((prev) => ({
        ...prev,
        slack: { ...prev.slack, handler },
      }));
    },
    [],
  );

  const toggleSlack = useCallback((enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      slack: { ...prev.slack, enabled },
    }));
  }, []);

  const save = useCallback(async () => {
    const emailRecipients: NotificationRecipient[] | null = config.email
      .sendToAllAdmins
      ? null
      : config.email.handler.recipients;

    const slackChannel: string | null =
      config.slack.enabled && config.slack.handler.recipients.length > 0
        ? config.slack.handler.recipients[0].details.value
        : null;

    await updateSettings({
      "security-center-email-recipients": emailRecipients,
      "security-center-slack-channel": slackChannel,
    }).unwrap();
  }, [config, updateSettings]);

  const resetConfig = useCallback(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  return {
    config,
    users,
    channels,
    updateEmailHandler,
    toggleSendToAllAdmins,
    updateSlackHandler,
    toggleSlack,
    save,
    resetConfig,
  };
}
