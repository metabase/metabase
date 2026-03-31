import { useCallback, useMemo, useState } from "react";

import {
  useGetChannelInfoQuery,
  useListUserRecipientsQuery,
} from "metabase/api";
import { useSendTestEmailMutation } from "metabase/api/email";
import type { RecipientPickerValue } from "metabase/lib/pulse";
import type { User } from "metabase-types/api";

export interface NotificationConfig {
  email: {
    sendToAllAdmins: boolean;
    recipients: RecipientPickerValue[];
  };
  slack: {
    enabled: boolean;
    channel: string;
  };
}

const DEFAULT_CONFIG: NotificationConfig = {
  email: {
    sendToAllAdmins: true,
    recipients: [],
  },
  slack: {
    enabled: false,
    channel: "",
  },
};

/**
 * Hook for notification channel configuration.
 * TODO: replace save with RTK Query endpoint (e.g. PUT /api/ee/security-center/notification-config)
 * TODO: replace sendTestSlack with a dedicated endpoint once available
 */
export function useNotificationConfig() {
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);

  const { data: userRecipients } = useListUserRecipientsQuery();
  const { data: channelInfo } = useGetChannelInfoQuery();
  const [sendTestEmailApi] = useSendTestEmailMutation();

  const users: User[] = userRecipients?.data ?? [];

  const slackChannelOptions: string[] = useMemo(() => {
    const slackSpec = channelInfo?.channels?.slack;
    const channelField = slackSpec?.fields?.find(
      (field) => field.name === "channel",
    );
    return channelField?.options ?? [];
  }, [channelInfo]);

  const updateEmailRecipients = useCallback(
    (recipients: RecipientPickerValue[]) => {
      setConfig((prev) => ({
        ...prev,
        email: { ...prev.email, recipients },
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

  const updateSlackChannel = useCallback((channel: string) => {
    setConfig((prev) => ({
      ...prev,
      slack: { ...prev.slack, channel },
    }));
  }, []);

  const toggleSlack = useCallback((enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      slack: { ...prev.slack, enabled },
    }));
  }, []);

  // TODO: replace with PUT /api/ee/security-center/notification-config
  const save = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, []);

  const sendTestEmail = useCallback(async () => {
    await sendTestEmailApi().unwrap();
  }, [sendTestEmailApi]);

  // TODO: backend needs a `can-connect?` impl for :channel/slack before this can use testSlackChannelApi
  const sendTestSlack = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }, []);

  return {
    config,
    users,
    slackChannelOptions,
    updateEmailRecipients,
    toggleSendToAllAdmins,
    updateSlackChannel,
    toggleSlack,
    save,
    sendTestEmail,
    sendTestSlack,
  };
}
