import { useState } from "react";
import { t } from "ttag";

import {
  type UserOption,
  UserPicker,
} from "metabase/common/components/UserPicker";
import { Flex, Text } from "metabase/ui";
import { getUserLabel } from "metabase/utils/user";
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

const buildInitialOwnerOption = (
  notification: Notification | AdminNotification,
): UserOption | null => {
  const { creator, creator_id } = notification;
  if (!creator || creator_id === null || creator_id === undefined) {
    return null;
  }
  return {
    id: creator_id,
    label: getUserLabel(creator),
  };
};
