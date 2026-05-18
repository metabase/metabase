import type { ReactNode } from "react";

import type {
  AdminNotification,
  NotificationChannelType,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationId,
  TaskRun,
} from "metabase-types/api";

import type { UserOption } from "../UserPicker";

export type SidebarProps = {
  notificationId: NotificationId;
  isBulkLoading: boolean;
  prevNotificationId: NotificationId | null;
  nextNotificationId: NotificationId | null;
  onClose: () => void;
  onDelete: (notification: AdminNotification) => void;
};

export type SidebarHeaderProps = {
  isBulkLoading: boolean;
  notification: AdminNotification;
  prevNotificationId: NotificationId | null;
  nextNotificationId: NotificationId | null;
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

export type RunHistorySectionProps = {
  title: string;
  viewAllUrl: string;
  runs: TaskRun[];
  isLoading: boolean;
};

export type EmailRecipientsSectionProps = {
  handler: NotificationHandlerEmail;
  count: number;
};

export type SlackChannelsSectionProps = {
  handler: NotificationHandlerSlack;
  count: number;
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

export type NotificationEditModalLoaderProps = {
  notification: AdminNotification;
  onClose: () => void;
  onUpdated: () => void;
};

export type OwnerSectionProps = {
  selectedOwner: UserOption;
  onChange: (next: UserOption) => void;
};
