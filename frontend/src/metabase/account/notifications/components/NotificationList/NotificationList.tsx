import cx from "classnames";
import type { JSX, ReactNode } from "react";
import { t } from "ttag";

import type { NotificationListItem } from "metabase/account/notifications/types";
import CS from "metabase/css/core/index.css";
import { UnstyledButton } from "metabase/ui";
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
        <UnstyledButton
          fz="sm"
          fw="bold"
          onClick={onHelp}
          className={cx(CS.textMedium, CS.textBrandHover)}
        >
          {t`Not seeing one here?`}
        </UnstyledButton>
      </NotificationHeader>
      {listItems.map((listItem) =>
        listItem.type === "pulse" ? (
          <DashboardNotificationCard
            key={`${listItem.type}-${listItem.item.id}`}
            listItem={listItem}
            user={user}
            isEditable={canManageSubscriptions}
            onUnsubscribe={onUnsubscribe}
            onArchive={onArchive}
          />
        ) : (
          <NotificationCard
            key={`${listItem.type}-${listItem.item.id}`}
            listItem={listItem}
            user={user}
            isEditable={canManageSubscriptions}
            onUnsubscribe={onUnsubscribe}
            onArchive={onArchive}
          />
        ),
      )}
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
