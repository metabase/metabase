import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { push } from "metabase/router";
import {
  Button,
  FileInput,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useCreateSeedMutation } from "metabase-enterprise/api";

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

// A seed's name becomes the physical table name that dependents reference, so it has to be a
// stable SQL-safe slug. Reject anything that isn't lower_snake_case starting with a letter.
function getNameError(name: string): string | null {
  if (name.length === 0) {
    return null;
  }
  if (!NAME_PATTERN.test(name)) {
    return t`Use lowercase letters, numbers, and underscores, starting with a letter.`;
  }
  return null;
}

export function NewSeedModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [createSeed, { isLoading }] = useCreateSeedMutation();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const nameError = getNameError(name);
  const canSubmit = name.length > 0 && !nameError && file != null && !isLoading;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || file == null) {
      return;
    }
    try {
      const table = await createSeed({ name, file }).unwrap();
      dispatch(addUndo({ message: t`Seed ${name} created` }));
      dispatch(push(Urls.dataStudioTable(table.id)));
    } catch (error: any) {
      const message = error?.data?.message ?? t`Could not create the seed`;
      dispatch(addUndo({ message, icon: "warning" }));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`New seed`}>
      <form onSubmit={handleSubmit}>
        <Stack gap="lg" mt="md">
          <TextInput
            label={t`Name`}
            description={t`Dependents reference this name, so choose it carefully. Renaming later can break them.`}
            placeholder="time_spine"
            value={name}
            error={nameError}
            onChange={(event) => setName(event.target.value)}
            data-autofocus
          />
          <FileInput
            label={t`CSV file`}
            placeholder={t`Choose a file`}
            accept="text/csv,text/tab-separated-values"
            leftSection={<Icon name="document" />}
            value={file}
            onChange={setFile}
          />
          <Group justify="space-between" mt="sm">
            <Text c="text-secondary" size="sm">
              {t`Creates a plain table, versioned in the Library.`}
            </Text>
            <Group gap="sm">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button
                type="submit"
                variant="filled"
                disabled={!canSubmit}
                loading={isLoading}
              >
                {t`Create`}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
