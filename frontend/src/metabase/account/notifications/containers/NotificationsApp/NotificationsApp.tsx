import type { JSX, ReactNode } from "react";
import { useMemo } from "react";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { skipToken, useListNotificationsQuery } from "metabase/api";
import { Pulses } from "metabase/entities/pulses";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUser,
} from "metabase/selectors/user";
import type { Alert } from "metabase-types/api";

import {
  navigateToArchive,
  navigateToHelp,
  navigateToUnsubscribe,
} from "../../actions";
import { NotificationList } from "../../components/NotificationList";

interface NotificationsAppProps {
  pulses: Alert[];
  children?: ReactNode;
}

const NotificationsAppInner = ({
  pulses,
  children,
}: NotificationsAppProps): JSX.Element | null => {
  const user = useSelector(getUser);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const dispatch = useDispatch();

  const { data: questionNotifications = [] } = useListNotificationsQuery(
    user
      ? {
          creator_or_recipient_id: user.id,
          include_inactive: false,
        }
      : skipToken,
  );

  const items = useMemo(() => {
    const combinedItems: NotificationListItem[] = [
      ...questionNotifications.map((alert) => ({
        item: alert,
        type: "question-notification" as const,
      })),
      ...pulses.map((pulse) => ({
        item: pulse,
        type: "pulse" as const,
      })),
    ];

    return combinedItems.sort(
      (a, b) =>
        parseTimestamp(b.item.created_at).unix() -
        parseTimestamp(a.item.created_at).unix(),
    );
  }, [pulses, questionNotifications]);

  const onHelp = () => dispatch(navigateToHelp());
  const onUnsubscribe = ({ item, type }: NotificationListItem) =>
    dispatch(navigateToUnsubscribe(item, type));
  const onArchive = ({ item, type }: NotificationListItem) =>
    dispatch(navigateToArchive(item, type));

  if (!user) {
    return null;
  }

  return (
    <NotificationList
      listItems={items}
      user={user}
      canManageSubscriptions={canManageSubscriptions}
      onHelp={onHelp}
      onUnsubscribe={onUnsubscribe}
      onArchive={onArchive}
    >
      {children}
    </NotificationList>
  );
};

export const NotificationsApp = Pulses.loadList({
  // Load all pulses the current user is a creator or recipient of
  query: () => ({ creator_or_recipient: true }),
  reload: true,
})(NotificationsAppInner);
