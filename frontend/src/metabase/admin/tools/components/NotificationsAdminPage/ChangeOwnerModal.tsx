import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { Button, Flex, Modal, Select } from "metabase/ui";
import type { UserId } from "metabase-types/api";

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
  const [selectedOwnerId, setSelectedOwnerId] = useState<UserId | null>(null);

  const { data, isLoading } = useListUsersQuery(
    { limit: 500 },
    { skip: !opened },
  );

  const options = useMemo(() => {
    const users = data?.data ?? [];
    return users
      .filter((user) => user.is_active)
      .map((user) => ({
        value: String(user.id),
        label: user.common_name || user.email,
      }));
  }, [data]);

  const handleClose = () => {
    setSelectedOwnerId(null);
    onClose();
  };

  const handleSubmit = () => {
    if (selectedOwnerId != null) {
      onConfirm(selectedOwnerId);
    }
  };

  const title =
    count === 1
      ? t`Change owner of 1 alert`
      : t`Change owner of ${count} alerts`;

  return (
    <Modal opened={opened} onClose={handleClose} title={title} size="md">
      <Flex direction="column" gap="md">
        <Select
          label={t`New owner`}
          placeholder={isLoading ? t`Loading…` : t`Select a user`}
          data={options}
          value={selectedOwnerId == null ? null : String(selectedOwnerId)}
          onChange={(next) => setSelectedOwnerId(next ? Number(next) : null)}
          searchable
          nothingFoundMessage={t`No users found`}
        />

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            disabled={selectedOwnerId == null || isSubmitting}
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
