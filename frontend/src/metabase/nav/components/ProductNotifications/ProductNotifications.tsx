import { useCallback } from "react";

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
  const notifications = useSetting("notifications");
  const { dismissedIds, dismiss } = useDismissNotification();

  // The backend already filters to relevant, undismissed notifications; we
  // additionally filter by the locally-known dismissals so a just-dismissed
  // card disappears (and the next one appears) without waiting on a refetch.
  // Only one notification is shown at a time to avoid overwhelming new users.
  const notification = (notifications ?? []).find(
    (candidate) => !(dismissedIds ?? []).includes(candidate.id),
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
