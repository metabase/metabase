import { type FormEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { push } from "metabase/router";
import {
  Button,
  FileInput,
  Group,
  Icon,
  Modal,
  Select,
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
  const { data: databasesData } = useListDatabasesQuery();

  // A seed materializes a real table, so only upload-enabled databases are valid targets.
  const uploadDatabases = useMemo(
    () => (databasesData?.data ?? []).filter((db) => db.uploads_enabled),
    [databasesData],
  );

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const [schema, setSchema] = useState("");

  const effectiveDbId =
    databaseId ??
    (uploadDatabases.length === 1 ? String(uploadDatabases[0].id) : null);

  const nameError = getNameError(name);
  const canSubmit =
    name.length > 0 &&
    !nameError &&
    file != null &&
    effectiveDbId != null &&
    !isLoading;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || file == null || effectiveDbId == null) {
      return;
    }
    try {
      const seed = await createSeed({
        name,
        file,
        databaseId: Number(effectiveDbId),
        schema: schema || undefined,
      }).unwrap();
      dispatch(addUndo({ message: t`Seed ${name} created` }));
      onClose();
      if (seed.table_id != null) {
        dispatch(push(Urls.dataStudioTable(seed.table_id)));
      }
    } catch (error: any) {
      const message = error?.data?.message ?? t`Could not create the seed`;
      dispatch(addUndo({ message, icon: "warning" }));
    }
  };

  const hasUploadDatabase = uploadDatabases.length > 0;

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
          <Select
            label={t`Database`}
            description={t`Seeds materialize into an upload-enabled database.`}
            placeholder={
              hasUploadDatabase
                ? t`Select a database`
                : t`No upload-enabled database`
            }
            data={uploadDatabases.map((db) => ({
              value: String(db.id),
              label: db.name,
            }))}
            value={effectiveDbId}
            onChange={setDatabaseId}
            disabled={!hasUploadDatabase}
          />
          <TextInput
            label={t`Schema`}
            description={t`Optional. Defaults to the database's upload schema.`}
            placeholder="public"
            value={schema}
            onChange={(event) => setSchema(event.target.value)}
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
              {t`Creates a plain table, published into the Library.`}
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
