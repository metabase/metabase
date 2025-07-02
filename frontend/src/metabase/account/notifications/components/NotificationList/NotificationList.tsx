import type { JSX, ReactNode } from "react";
import { t } from "ttag";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { TextButton } from "metabase/common/components/Button.styled";
import * as Urls from "metabase/lib/urls";
import type { User } from "metabase-types/api";

import {
  DashboardNotificationCard,
  NotificationCard,
} from "../NotificationCard";

import {
  NotificationHeader,
  NotificationIcon,
  NotificationLabel,
  NotificationMessage,
  NotificationSection,
} from "./NotificationList.styled";

type NotificationListProps = {
  listItems: NotificationListItem[];
  user: User;
  children?: ReactNode;
  canManageSubscriptions: boolean;
  onHelp: () => void;
  onUnsubscribe: (listItem: NotificationListItem) => void;
  onArchive: (listItem: NotificationListItem) => void;
};

export const NotificationList = ({
  listItems,
  user,
  children,
  canManageSubscriptions,
  onHelp,
  onUnsubscribe,
  onArchive,
}: NotificationListProps): JSX.Element => {
  if (!listItems.length) {
    return <NotificationEmptyState>{children}</NotificationEmptyState>;
  }

  return (
    <div data-testid="notifications-list">
      <NotificationHeader>
        <NotificationLabel>{t`You receive or created these`}</NotificationLabel>
        <TextButton size="small" onClick={onHelp}>
          {t`Not seeing one here?`}
        </TextButton>
      </NotificationHeader>
      {listItems.map((listItem) => {
        switch (listItem.type) {
          case "pulse":
            return (
              <DashboardNotificationCard
                key={`${listItem.type}-${listItem.item.id}`}
                listItem={listItem}
                user={user}
                isEditable={canManageSubscriptions}
                onUnsubscribe={onUnsubscribe}
                onArchive={onArchive}
              />
            );
          case "table-notification": {
            const payload = listItem.item.payload;
            return (
              <NotificationCard
                key={`${listItem.type}-${listItem.item.id}`}
                listItem={listItem}
                user={user}
                isEditable={canManageSubscriptions}
                onUnsubscribe={onUnsubscribe}
                onArchive={onArchive}
                entityLink={Urls.tableView(
                  payload.table!.db_id,
                  payload.table_id,
                )}
              />
            );
          }
          case "question-notification":
            return (
              <NotificationCard
                key={`${listItem.type}-${listItem.item.id}`}
                listItem={listItem}
                user={user}
                isEditable={canManageSubscriptions}
                onUnsubscribe={onUnsubscribe}
                onArchive={onArchive}
                entityLink={Urls.question({
                  id: listItem.item.payload.card_id,
                  card_id: listItem.item.payload.card_id,
                })}
              />
            );
        }
      })}
      {children}
    </div>
  );
};

const NotificationEmptyState = ({ children }: { children?: ReactNode }) => {
  return (
    <>
      <NotificationSection>
        <NotificationIcon name="bell" />
        <NotificationMessage>
          {t`If you subscribe or are added to dashboard subscriptions or alerts you’ll be able to manage those here.`}
        </NotificationMessage>
        {children}
      </NotificationSection>
    </>
  );
};
