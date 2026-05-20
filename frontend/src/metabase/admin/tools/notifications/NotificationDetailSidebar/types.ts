import type { ReactNode } from "react";

import type {
  AdminNotification,
  CardId,
  NotificationChannelType,
  NotificationHandlerHttp,
  NotificationId,
  NotificationRunSummary,
  NotificationTickSendEntry,
} from "metabase-types/api";

export type SidebarProps = {
  notificationId: NotificationId;
  notificationSummary: AdminNotification | undefined;
  isBulkLoading: boolean;
  prevNotificationId: NotificationId | null;
  nextNotificationId: NotificationId | null;
  onClose: () => void;
  onDelete: (notification: AdminNotification) => void;
};

export type SidebarHeaderProps = {
  isBulkLoading: boolean;
  notificationId: NotificationId;
  notification: AdminNotification | undefined;
  prevNotificationId: NotificationId | null;
  nextNotificationId: NotificationId | null;
  isQuestionLoading: boolean;
  onClose: () => void;
  onDelete: (notification: AdminNotification) => void;
  onEdit: () => void;
};

export type ChannelAvatarProps = {
  channel: NotificationChannelType;
  bordered: boolean;
};

export type DetailsSectionProps = {
  notification: AdminNotification;
  emailRecipientCount: number;
  slackChannelCount: number;
  httpHandler: NotificationHandlerHttp | undefined;
};

export type NotificationRunSummaryLogProps = {
  title: string;
  runs: (NotificationRunSummary | NotificationTickSendEntry)[] | undefined;
  isLoading: boolean;
  cardId: CardId;
};

export type SidebarSectionProps = {
  title: string;
  titleAside?: ReactNode;
  children: ReactNode;
};

export type DetailsRowProps = {
  label: ReactNode;
  value: ReactNode;
  bold?: boolean;
  spanLabel?: boolean;
};
