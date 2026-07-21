import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { type Seed, useDeleteSeedMutation } from "metabase-enterprise/api";

export function DeleteSeedModal({
  seed,
  opened,
  onClose,
}: {
  seed: Seed;
  opened: boolean;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [deleteSeed, { isLoading }] = useDeleteSeedMutation();

  const handleDelete = async () => {
    try {
      await deleteSeed(seed.id).unwrap();
      dispatch(addUndo({ message: t`Seed ${seed.name} deleted` }));
      onClose();
    } catch (error: any) {
      const message = error?.data?.message ?? t`Could not delete the seed`;
      dispatch(addUndo({ message, icon: "warning" }));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Delete ${seed.name}?`}>
      <Stack gap="lg" mt="md">
        <Text c="text-secondary" size="sm">
          {t`This drops the ${seed.name} table from the database. Anything that queries it will break.`}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            color="error"
            variant="filled"
            loading={isLoading}
            onClick={handleDelete}
          >
            {t`Delete`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
