import React, { useRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isSyncCompleted } from "metabase/lib/syncing";
import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModal.jsx";
import ActionButton from "metabase/components/ActionButton";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "metabase/components/ConfirmContent";
import Button from "metabase/core/components/Button";
import {
  isDatabaseWritebackEnabled,
  isWritebackSupported,
} from "metabase/writeback/utils";

import ModelCachingControl from "./ModelCachingControl";
import { SidebarRoot } from "./Sidebar.styled";

const propTypes = {
  database: PropTypes.object.isRequired,
  updateDatabase: PropTypes.func.isRequired,
  deleteDatabase: PropTypes.func.isRequired,
  syncDatabaseSchema: PropTypes.func.isRequired,
  dismissSyncSpinner: PropTypes.func.isRequired,
  rescanDatabaseFields: PropTypes.func.isRequired,
  discardSavedFieldValues: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool,
  isWritebackEnabled: PropTypes.bool,
  isModelPersistenceEnabled: PropTypes.bool,
};

const DatabaseEditAppSidebar = ({
  database,
  deleteDatabase,
  updateDatabase,
  syncDatabaseSchema,
  dismissSyncSpinner,
  rescanDatabaseFields,
  discardSavedFieldValues,
  isAdmin,
  isWritebackEnabled,
  isModelPersistenceEnabled,
}) => {
  const discardSavedFieldValuesModal = useRef();
  const enableWritebackModal = useRef();
  const deleteDatabaseModal = useRef();

  const hasWriteback = isDatabaseWritebackEnabled(database);
  const showWriteback =
    isWritebackEnabled &&
    typeof database.id === "number" &&
    isWritebackSupported(database);

  return (
    <SidebarRoot>
      <div className="Actions bg-light rounded p3">
        <div className="Actions-group">
          <label className="Actions-groupLabel block text-bold">{t`Actions`}</label>
          <ol>
            {!isSyncCompleted(database) && (
              <li>
                <Button disabled borderless>{t`Syncing database…`}</Button>
              </li>
            )}
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
            {database["initial_sync_status"] !== "complete" && (
              <li className="mt2">
                <ActionButton
                  actionFn={() => dismissSyncSpinner(database.id)}
                  className="Button Button--dismissSyncSpinner"
                  normalText={t`Dismiss sync spinner manually`}
                  activeText={t`Dismissing…`}
                  failedText={t`Failed to dismiss sync spinner`}
                  successText={t`Sync spinners dismissed!`}
                />
              </li>
            )}
            {isModelPersistenceEnabled && database.supportsPersistence() && (
              <li className="mt2">
                <ModelCachingControl database={database} />
              </li>
            )}
          </ol>
        </div>

        <div className="Actions-group">
          <label className="Actions-groupLabel block text-bold">{t`Danger Zone`}</label>
          <ol>
            {isSyncCompleted(database) && (
              <li>
                <ModalWithTrigger
                  ref={discardSavedFieldValuesModal}
                  triggerClasses="Button Button--danger Button--discardSavedFieldValues"
                  triggerElement={t`Discard saved field values`}
                >
                  <ConfirmContent
                    title={t`Discard saved field values`}
                    onClose={() =>
                      discardSavedFieldValuesModal.current.toggle()
                    }
                    onAction={() => discardSavedFieldValues(database.id)}
                  />
                </ModalWithTrigger>
              </li>
            )}

            {isAdmin && (
              <li className="mt2">
                <ModalWithTrigger
                  ref={deleteDatabaseModal}
                  triggerClasses="Button Button--deleteDatabase Button--danger"
                  triggerElement={t`Remove this database`}
                >
                  <DeleteDatabaseModal
                    database={database}
                    onClose={() => deleteDatabaseModal.current.toggle()}
                    onDelete={() => deleteDatabase(database.id, true)}
                  />
                </ModalWithTrigger>
              </li>
            )}

            {showWriteback && (
              <li className="mt2">
                <ModalWithTrigger
                  ref={enableWritebackModal}
                  triggerClasses="Button Button--danger Button--discardSavedFieldValues"
                  triggerElement={
                    hasWriteback ? t`Disable actions` : t`Enable actions`
                  }
                >
                  <ConfirmContent
                    title={
                      hasWriteback
                        ? t`Disable Actions`
                        : t`[EXPERIMENTAL] Enable Actions`
                    }
                    message={
                      hasWriteback
                        ? undefined
                        : t`Are you sure you want to enable EXPERIMENTAL Actions? This will enable Metabase features that write to your database`
                    }
                    onClose={() => enableWritebackModal.current.toggle()}
                    onAction={() =>
                      updateDatabase({
                        id: database.id,
                        settings: { "database-enable-actions": !hasWriteback },
                      })
                    }
                  />
                </ModalWithTrigger>
              </li>
            )}
          </ol>
        </div>
      </div>
    </SidebarRoot>
  );
};

DatabaseEditAppSidebar.propTypes = propTypes;

export default DatabaseEditAppSidebar;
