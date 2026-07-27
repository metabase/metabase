import { useCallback } from "react";

import {
  useDismissProductNotificationMutation,
  useListProductNotificationsQuery,
} from "metabase/api";
import { Markdown } from "metabase/common/components/Markdown";
import { useSetting, useUserSetting } from "metabase/common/hooks";
import { NavbarPromoCard } from "metabase/nav/components/NavbarPromoCard";
import { Icon, isValidIconName } from "metabase/ui";

export const useDismissNotification = () => {
  const [dismissedIds, setDismissedIds] = useUserSetting(
    "dismissed-notification-ids",
    { shouldRefresh: false, shouldDebounce: false },
  );

  const dismiss = useCallback(
    (notificationId: string) => {
      setDismissedIds([...(dismissedIds ?? []), notificationId]);
    },
    [dismissedIds, setDismissedIds],
  );

  return { dismissedIds, dismiss };
};

export function ProductNotifications() {
  const settingsNotifications = useSetting("notifications");
  const { dismissedIds, dismiss: dismissSettingNotification } =
    useDismissNotification();
  const { data: apiNotifications, isSuccess: hasApiNotifications } =
    useListProductNotificationsQuery();
  const [dismissApiNotification] = useDismissProductNotificationMutation();
  const notifications = hasApiNotifications
    ? apiNotifications
    : settingsNotifications;
  const dismiss = useCallback(
    (notificationId: string) => {
      if (hasApiNotifications) {
        void dismissApiNotification(notificationId);
      } else {
        dismissSettingNotification(notificationId);
      }
    },
    [dismissApiNotification, dismissSettingNotification, hasApiNotifications],
  );

  // The Settings fallback keeps this stacked backend branch compatible with
  // the frontend it was based on.
  const notification = (notifications ?? []).find(
    (candidate) =>
      hasApiNotifications || !(dismissedIds ?? []).includes(candidate.id),
  );

  if (!notification) {
    return null;
  }

  return (
    <NavbarPromoCard
      icon={
        isValidIconName(notification.icon) && <Icon name={notification.icon} />
      }
      title={notification.title}
      body={<Markdown>{notification.content}</Markdown>}
      onDismiss={() => dismiss(notification.id)}
    />
  );
}
