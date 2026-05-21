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
  onConfirm: (creatorId: UserId) => void;
};

export const ChangeOwnerModal = ({
  opened,
  count,
  isSubmitting,
  onClose,
  onConfirm,
}: Props) => {
  const [selectedCreator, setSelectedCreator] = useState<UserOption | null>(
    null,
  );

  const handleClose = () => {
    setSelectedCreator(null);
    onClose();
  };

  const handleSubmit = () => {
    if (selectedCreator !== null) {
      onConfirm(selectedCreator.id);
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
          value={selectedCreator}
          onChange={setSelectedCreator}
        />

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose}>
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
