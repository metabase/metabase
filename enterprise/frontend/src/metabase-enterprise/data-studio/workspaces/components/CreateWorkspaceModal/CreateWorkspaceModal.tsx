import { type FormEvent, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Flex, Modal, Select, Stack, TextInput } from "metabase/ui";

type DatabaseOption = {
  value: string;
  label: string;
};

export type CreateWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (workspace: { name: string; databaseId: string }) => void;
  databaseOptions: DatabaseOption[];
  isSubmitting?: boolean;
  defaultName?: string;
  defaultDatabaseId?: string | null;
};

export function CreateWorkspaceModal({
  opened,
  onClose,
  onSubmit,
  databaseOptions,
  isSubmitting = false,
  defaultName,
  defaultDatabaseId = null,
}: CreateWorkspaceModalProps) {
  const initialName = useMemo(
    () => defaultName ?? t`New workspace`,
    [defaultName],
  );
  const [workspaceName, setWorkspaceName] = useState(initialName);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    defaultDatabaseId,
  );

  useEffect(() => {
    if (!opened) {
      return;
    }
    setWorkspaceName(initialName);
    setSelectedDatabaseId(defaultDatabaseId);
  }, [opened, initialName, defaultDatabaseId]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedDatabaseId || !workspaceName.trim() || isSubmitting) {
      return;
    }

    onSubmit({
      name: workspaceName.trim(),
      databaseId: selectedDatabaseId,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Create new workspace`}
      withinPortal
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            autoFocus
            label={t`Workspace name`}
            placeholder={t`Enter workspace name`}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            required
          />
          <Select
            label={t`Database`}
            placeholder={t`Select a database`}
            description={t`Data warehouses that don't support workspaces feature are disabled.`}
            data={databaseOptions}
            value={selectedDatabaseId}
            onChange={setSelectedDatabaseId}
            required
            searchable
          />
          <Flex gap="sm" justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              disabled={
                !selectedDatabaseId || !workspaceName.trim() || isSubmitting
              }
              type="submit"
              loading={isSubmitting}
            >
              {t`Create`}
            </Button>
          </Flex>
        </Stack>
      </form>
    </Modal>
  );
}
