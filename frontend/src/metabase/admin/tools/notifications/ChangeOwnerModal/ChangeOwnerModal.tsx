import { useState } from "react";
import { t } from "ttag";

import {
  type UserOption,
  UserPicker,
} from "metabase/common/components/UserPicker";
import { Button, Flex, Modal } from "metabase/ui";
import type { AdminNotification, UserId } from "metabase-types/api";

type Props = {
  opened: boolean;
  notifications: AdminNotification[];
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (creatorId: UserId) => void;
};

export const ChangeOwnerModal = ({
  opened,
  notifications,
  isSubmitting,
  onClose,
  onConfirm,
}: Props) => {
  const count = notifications.length;

  const [selectedCreator, setSelectedCreator] = useState<UserOption | null>(
    () => {
      if (notifications.length !== 1) {
        return null;
      }
      const creator = notifications[0].creator;
      return creator ? { id: creator.id, label: creator.common_name } : null;
    },
  );

  const handleSubmit = () => {
    if (selectedCreator !== null) {
      onConfirm(selectedCreator.id);
    }
  };

  const title =
    count === 1
      ? t`Select new owner of 1 alert`
      : t`Select new owner of ${count} alerts`;

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Flex direction="column" gap="md">
        <UserPicker value={selectedCreator} onChange={setSelectedCreator} />

        <Flex justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            disabled={selectedCreator === null || isSubmitting}
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            {t`Change owner`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};
