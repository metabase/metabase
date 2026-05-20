import { useState } from "react";
import { t } from "ttag";

import type { UserOption } from "metabase/admin/tools/notifications/UserPicker";
import { UserPicker } from "metabase/admin/tools/notifications/UserPicker";
import { Flex, Text } from "metabase/ui";
import type {
  AdminNotification,
  Notification,
  UserId,
} from "metabase-types/api";

type Props = {
  editingNotification: Notification | AdminNotification;
  onChange: (creatorId: UserId) => void;
};

export const NotificationOwner = ({ editingNotification, onChange }: Props) => {
  const [selected, setSelected] = useState<UserOption | null>(() =>
    buildInitialOwnerOption(editingNotification),
  );

  const handleChange = (next: UserOption) => {
    setSelected(next);
    onChange(next.id);
  };

  return (
    <Flex align="center" gap="md">
      <Text fw="bold" size="md" c="text-primary" w={56}>
        {t`Owner`}
      </Text>
      <UserPicker flex={1} value={selected} onChange={handleChange} />
    </Flex>
  );
};

const isAdminNotification = (
  notification: Notification | AdminNotification,
): notification is AdminNotification => "owner_id" in notification;

const buildInitialOwnerOption = (
  notification: Notification | AdminNotification,
): UserOption | null => {
  const owner = isAdminNotification(notification)
    ? notification.owner
    : notification.creator;
  const ownerId = isAdminNotification(notification)
    ? notification.owner_id
    : notification.creator_id;
  if (!owner || ownerId === null || ownerId === undefined) {
    return null;
  }
  const label = owner.common_name || owner.email || t`Unknown`;
  return {
    id: ownerId,
    label: !owner.is_active ? t`${label} (deactivated)` : label,
  };
};
