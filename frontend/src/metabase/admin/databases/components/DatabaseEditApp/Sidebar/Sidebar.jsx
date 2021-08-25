/* eslint-disable react/prop-types */
import React, { useRef } from "react";
import { Box } from "grid-styled";
import { t } from "ttag";

import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModal.jsx";
import ActionButton from "metabase/components/ActionButton";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "metabase/components/ConfirmContent";

const DatabaseEditAppSidebar = ({
  database,
  deleteDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
}) => {
  const discardSavedFieldValuesModal = useRef();
  const deleteDatabaseModal = useRef();

  return (
    <Box ml={[2, 3]} width={420}>
      <div className="Actions bg-light rounded p3">
        <div className="Actions-group">
          <label className="Actions-groupLabel block text-bold">{t`Actions`}</label>
          <ol>
            <li>
              <ActionButton
                actionFn={() => syncDatabaseSchema(database.id)}
                className="Button Button--syncDbSchema"
                normalText={t`Sync database schema now`}
                activeText={t`Starting…`}
                failedText={t`Failed to sync`}
                successText={t`Sync triggered!`}
              />
            </li>
            <li className="mt2">
              <ActionButton
                actionFn={() => rescanDatabaseFields(database.id)}
                className="Button Button--rescanFieldValues"
                normalText={t`Re-scan field values now`}
                activeText={t`Starting…`}
                failedText={t`Failed to start scan`}
                successText={t`Scan triggered!`}
              />
            </li>
          </ol>
        </div>

        <div className="Actions-group">
          <label className="Actions-groupLabel block text-bold">{t`Danger Zone`}</label>
          <ol>
            <li>
              <ModalWithTrigger
                ref={discardSavedFieldValuesModal}
                triggerClasses="Button Button--danger Button--discardSavedFieldValues"
                triggerElement={t`Discard saved field values`}
              >
                <ConfirmContent
                  title={t`Discard saved field values`}
                  onClose={() => discardSavedFieldValuesModal.current.toggle()}
                  onAction={() => discardSavedFieldValues(database.id)}
                />
              </ModalWithTrigger>
            </li>

            <li className="mt2">
              <ModalWithTrigger
                ref={deleteDatabaseModal}
                triggerClasses="Button Button--deleteDatabase Button--danger"
                triggerElement={t`Remove this database`}
              >
                <DeleteDatabaseModal
                  database={database}
                  onClose={() => this.deleteDatabaseModal.current.toggle()}
                  onDelete={() => deleteDatabase(database.id, true)}
                />
              </ModalWithTrigger>
            </li>
          </ol>
        </div>
      </div>
    </Box>
  );
};

export default DatabaseEditAppSidebar;
