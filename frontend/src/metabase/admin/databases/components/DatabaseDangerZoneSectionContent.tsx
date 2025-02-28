import { useCallback, useRef } from "react";
import { t } from "ttag";

import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import { useDiscardDatabaseFieldValuesMutation } from "metabase/api";
import ConfirmContent from "metabase/components/ConfirmContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Button, Flex } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

import { deleteDatabase } from "../database";

export const DatabaseDangerZoneSectionContent = ({
  isAdmin,
  database,
}: {
  isAdmin: boolean;
  database: Database;
}) => {
  const dispatch = useDispatch();

  const discardSavedFieldValuesModal = useRef<any>();
  const deleteDatabaseModal = useRef<any>();

  const [discardDatabaseFieldValues] = useDiscardDatabaseFieldValuesMutation();

  const handleSavedFieldsModalClose = useCallback(() => {
    discardSavedFieldValuesModal.current.close();
  }, []);

  const handleDeleteDatabaseModalClose = useCallback(() => {
    deleteDatabaseModal.current.close();
  }, []);

  const handleDeleteDatabase = useCallback(
    () => dispatch(deleteDatabase(database.id)),
    [dispatch, database.id],
  );

  // TODO: hide the entire section is there are no actions that can be taken...
  // or show a disabled button or something if the sync is not complete?

  return (
    <Flex gap="sm">
      {isSyncCompleted(database) && (
        <ModalWithTrigger
          triggerElement={
            <Button
              variant="filled"
              color="danger"
            >{t`Discard saved field values`}</Button>
          }
          ref={discardSavedFieldValuesModal}
        >
          <ConfirmContent
            title={t`Discard saved field values`}
            onClose={handleSavedFieldsModalClose}
            onAction={() => discardDatabaseFieldValues(database.id)}
          />
        </ModalWithTrigger>
      )}
      {isAdmin && (
        <ModalWithTrigger
          triggerElement={
            <Button
              variant="filled"
              color="danger"
            >{t`Remove this database`}</Button>
          }
          ref={deleteDatabaseModal}
        >
          <DeleteDatabaseModal
            database={database}
            onClose={handleDeleteDatabaseModalClose}
            onDelete={handleDeleteDatabase}
          />
        </ModalWithTrigger>
      )}
    </Flex>
  );
};
