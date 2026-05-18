import { useState } from "react";
import { t } from "ttag";

import { Button, Flex, Modal } from "metabase/ui";
import type { UserId } from "metabase-types/api";

import { type UserOption, UserPicker } from "../UserPicker";

type Props = {
  opened: boolean;
  count: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (ownerId: UserId) => void;
};

export const ChangeOwnerModal = ({
  opened,
  count,
  isSubmitting,
  onClose,
  onConfirm,
}: Props) => {
  const [selectedOwner, setSelectedOwner] = useState<UserOption | null>(null);

  const handleClose = () => {
    setSelectedOwner(null);
    onClose();
  };

  const handleSubmit = () => {
    if (selectedOwner !== null) {
      onConfirm(selectedOwner.id);
    }
  };

  const title =
    count === 1
      ? t`Change owner of 1 alert`
      : t`Change owner of ${count} alerts`;

  return (
    <Modal opened={opened} onClose={handleClose} title={title} size="md">
      <Flex direction="column" gap="md">
        <UserPicker
          label={t`New owner`}
          value={selectedOwner}
          onChange={setSelectedOwner}
        />

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            disabled={selectedOwner === null || isSubmitting}
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
