import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DeleteDatabaseModal } from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDiscardDatabaseFieldValuesMutation } from "metabase/api";
import { ConfirmModal } from "metabase/components/ConfirmModal";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Button, Flex } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import { DatabaseInfoSection } from "../DatabaseInfoSection";

export const DatabaseDangerZoneSection = ({
  isAdmin,
  database,
  deleteDatabase,
}: {
  isAdmin: boolean;
  database: Database;
  deleteDatabase: (databaseId: DatabaseId) => Promise<void>;
}) => {
  const [discardDatabaseFieldValues] = useDiscardDatabaseFieldValuesMutation();

  const [isSavedFieldsModalOpen, saveFieldsModal] = useDisclosure(false);
  const [isDeleteDbModalOpen, deleteDbModal] = useDisclosure(false);

  const handleDiscardFieldValues = async () => {
    return discardDatabaseFieldValues(database.id).then(() =>
      saveFieldsModal.close(),
    );
  };

  const handleDeleteDatabase = async () => {
    return deleteDatabase(database.id).then(() => deleteDbModal.close());
  };

  const hasCompletedSync = isSyncCompleted(database);
  const shouldHideSection =
    database.is_attached_dwh ||
    [hasCompletedSync, isAdmin].every((bool) => bool === false);

  if (shouldHideSection) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Danger zone`}
      description={t`Remove this database and other destructive actions.`}
      data-testid="database-danger-zone-section"
    >
      <Flex gap="sm" wrap="wrap">
        {isSyncCompleted(database) && (
          <>
            <Button
              variant="filled"
              color="danger"
              onClick={saveFieldsModal.open}
            >{t`Discard saved field values`}</Button>
            <ConfirmModal
              opened={isSavedFieldsModalOpen}
              title={t`Discard saved field values`}
              onClose={saveFieldsModal.close}
              onConfirm={handleDiscardFieldValues}
              padding="xl"
              data-testid="discard-field-values-confirm-modal"
            />
          </>
        )}
        {isAdmin && (
          <>
            <Button
              variant="filled"
              color="danger"
              onClick={deleteDbModal.open}
            >{t`Remove this database`}</Button>
            <DeleteDatabaseModal
              opened={isDeleteDbModalOpen}
              title={t`Delete the ${database.name} database?`}
              defaultDatabaseRemovalMessage={t`This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone!`}
              database={database}
              onClose={deleteDbModal.close}
              onDelete={handleDeleteDatabase}
              data-testid="remove-database-confirm-modal"
            />
          </>
        )}
      </Flex>
    </DatabaseInfoSection>
  );
};
