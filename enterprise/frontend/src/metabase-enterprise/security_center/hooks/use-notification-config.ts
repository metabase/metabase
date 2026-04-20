import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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

const ADMIN_GROUP_ID = 2;

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

function isAdminGroupRecipient(r: NotificationRecipient): boolean {
  return (
    r.type === "notification-recipient/group" &&
    r.permissions_group_id === ADMIN_GROUP_ID
  );
}

function configFromSettings(
  emailRecipients: NotificationRecipient[] | null,
  slackChannel: string | null,
): NotificationConfig {
  const recipients = emailRecipients ?? [];
  // null means no setting saved yet — default to sending to all admins
  const sendToAllAdmins =
    emailRecipients === null || recipients.some(isAdminGroupRecipient);

  // Filter out the admin group recipient — it's represented by the toggle
  const extraRecipients = recipients.filter((r) => !isAdminGroupRecipient(r));

  return {
    email: {
      sendToAllAdmins,
      handler: {
        channel_type: "channel/email",
        recipients: extraRecipients,
      },
    },
    slack: {
      enabled: slackChannel !== null,
      handler: buildSlackHandler(slackChannel),
    },
  };
}

type NotificationConfigValue = {
  config: NotificationConfig;
  users: User[];
  channels: ChannelApiResponse["channels"] | undefined;
  updateEmailHandler: (handler: NotificationHandlerEmail) => void;
  toggleSendToAllAdmins: (sendToAllAdmins: boolean) => void;
  updateSlackHandler: (handler: NotificationHandlerSlack) => void;
  toggleSlack: (enabled: boolean) => void;
  save: () => Promise<void>;
  resetConfig: () => void;
};

const NotificationConfigContext = createContext<NotificationConfigValue | null>(
  null,
);

export const NotificationConfigProvider = NotificationConfigContext.Provider;

/**
 * Hook for notification channel configuration.
 * When used inside a NotificationConfigProvider, returns the shared context.
 * When used as the root (in the modal), creates and owns the state.
 */
export function useNotificationConfig(): NotificationConfigValue {
  const ctx = useContext(NotificationConfigContext);
  if (ctx) {
    return ctx;
  }
  throw new Error(
    "useNotificationConfig must be used inside a NotificationConfigProvider",
  );
}

/**
 * Creates the notification config state. Should be called once in the modal
 * and provided to children via NotificationConfigProvider.
 */
export function useNotificationConfigState(): NotificationConfigValue {
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
    const adminGroupRecipient: NotificationRecipient = {
      type: "notification-recipient/group",
      permissions_group_id: ADMIN_GROUP_ID,
    };

    const emailRecipients: NotificationRecipient[] = [
      ...(config.email.sendToAllAdmins ? [adminGroupRecipient] : []),
      ...config.email.handler.recipients,
    ];

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
