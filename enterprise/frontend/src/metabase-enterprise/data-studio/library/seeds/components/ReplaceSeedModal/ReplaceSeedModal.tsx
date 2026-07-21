import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Button,
  FileInput,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import { type Seed, useReplaceSeedCsvMutation } from "metabase-enterprise/api";

export function ReplaceSeedModal({
  seed,
  opened,
  onClose,
}: {
  seed: Seed;
  opened: boolean;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [replaceSeedCsv, { isLoading }] = useReplaceSeedCsvMutation();
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (file == null || isLoading) {
      return;
    }
    try {
      await replaceSeedCsv({ id: seed.id, file }).unwrap();
      dispatch(addUndo({ message: t`Seed ${seed.name} updated` }));
      onClose();
    } catch (error: any) {
      const message = error?.data?.message ?? t`Could not update the seed`;
      dispatch(addUndo({ message, icon: "warning" }));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Replace ${seed.name}`}>
      <form onSubmit={handleSubmit}>
        <Stack gap="lg" mt="md">
          <Text c="text-secondary" size="sm">
            {t`The table is rebuilt from the new file. Columns can change freely; the name stays the same, so dependents keep working.`}
          </Text>
          <FileInput
            label={t`CSV file`}
            placeholder={t`Choose a file`}
            accept="text/csv,text/tab-separated-values"
            leftSection={<Icon name="document" />}
            value={file}
            onChange={setFile}
          />
          <Group justify="flex-end" gap="sm" mt="sm">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              type="submit"
              variant="filled"
              disabled={file == null}
              loading={isLoading}
            >
              {t`Replace`}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
