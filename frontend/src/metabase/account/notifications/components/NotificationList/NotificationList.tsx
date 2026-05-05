import cx from "classnames";
import type { JSX, ReactNode } from "react";
import { t } from "ttag";

import type { NotificationListItem } from "metabase/account/notifications/types";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Text, UnstyledButton } from "metabase/ui";
import type { User } from "metabase-types/api";

import {
  DashboardNotificationCard,
  NotificationCard,
} from "../NotificationCard";

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
      <Flex align="center" mb="lg">
        <Text c="text-primary" fz="md" fw={700} flex="1 1 auto" m={0}>
          {t`You receive or created these`}
        </Text>
        <UnstyledButton
          fz="sm"
          fw="bold"
          onClick={onHelp}
          className={cx(CS.textMedium, CS.textBrandHover)}
        >
          {t`Not seeing one here?`}
        </UnstyledButton>
      </Flex>
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
    <Flex direction="column" align="center">
      <Icon
        name="bell"
        size="3.25rem"
        c="background-tertiary-inverse"
        mt="4.875rem"
        mb="1.75rem"
      />
      <Box maw="24rem" ta="center">
        {t`If you subscribe or are added to dashboard subscriptions or alerts you’ll be able to manage those here.`}
      </Box>
      {children}
    </Flex>
  );
};
