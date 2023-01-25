import React, { FormEvent, useState } from "react";
import { jt, t } from "ttag";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import type { DatabaseUsageInfo } from "metabase-types/api";
import useFetch from "metabase/hooks/use-fetch";
import Alert from "metabase/core/components/Alert";
import Input from "metabase/core/components/Input";
import type Database from "metabase-lib/metadata/Database";
import ContentRemovalConfirmation from "../ContentRemovalConfirmation";
import {
  DeleteDatabaseModalFooter,
  DeleteDatabaseModalRoot,
  DeleteDatabaseModalSection,
  ErrorMessage,
} from "./DeleteDatabaseModal.styled";

const hasContentInDatabase = (usageInfo: DatabaseUsageInfo) => {
  return (
    usageInfo.question > 0 ||
    usageInfo.dataset > 0 ||
    usageInfo.metric > 0 ||
    usageInfo.segment > 0
  );
};

const getErrorMessage = (error: any) => {
  if (!error) {
    return null;
  }

  let errorMessage = t`Server error encountered`;
  if (error.data && error.data.message) {
    errorMessage = error.data.message;
  } else {
    errorMessage = error.message;
  }

  return <span className="text-error px2">{errorMessage}</span>;
};

interface DeleteDatabaseModalProps {
  onClose: () => void;
  onDelete: (database: Database) => void;
  database: Database;
}

const DeleteDatabaseModal = ({
  database,
  onClose,
  onDelete,
}: DeleteDatabaseModalProps) => {
  const { data: usageInfo } = useFetch<DatabaseUsageInfo>(
    `/api/database/${database.id}/usage_info`,
  );

  const [isContentRemovalConfirmed, setIsContentRemovalConfirmed] =
    useState(false);
  const [databaseNameConfirmation, setDatabaseNameConfirmation] = useState("");
  const [error, setError] = useState<any>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      onDelete(database);
      // immediately call on close because database deletion should be non blocking
      onClose();
    } catch (error) {
      setError(error);
    }
  };

  const handleEditConnectionDetailsClick = e => {
    e.preventDefault();
    onClose();
  };

  const hasContent = usageInfo && hasContentInDatabase(usageInfo);

  const isDatabaseNameConfirmed =
    databaseNameConfirmation.trim().toLowerCase() ===
    database.name.trim().toLowerCase();
  const shouldShowDbNameInputConfirmation =
    isContentRemovalConfirmed || !hasContent;
  const canDelete =
    (isContentRemovalConfirmed || !hasContent) && isDatabaseNameConfirmed;

  const deleteButtonLabel = hasContent
    ? t`Delete this content and the DB connection`
    : t`Delete`;

  const errorMessage = getErrorMessage(error);

  return (
    <ModalContent
      title={t`Delete the ${database.name} database?`}
      onClose={onClose}
    >
      <DeleteDatabaseModalRoot onSubmit={canDelete ? handleSubmit : undefined}>
        {!shouldShowDbNameInputConfirmation && (
          <DeleteDatabaseModalSection>
            <Alert icon="info">
              {jt`If you’re trying to migrate from a development DB to a production one, you don’t need to do this. You can just ${(
                <Button
                  onlyText
                  onClick={handleEditConnectionDetailsClick}
                >{`edit your connection details.`}</Button>
              )}`}
            </Alert>
          </DeleteDatabaseModalSection>
        )}
        {hasContent && (
          <>
            <DeleteDatabaseModalSection>
              {t`Deleting this database will also delete everything based on it. If you’re really trying to do this, please check each of these boxes:`}
            </DeleteDatabaseModalSection>

            <DeleteDatabaseModalSection>
              <ContentRemovalConfirmation
                usageInfo={usageInfo}
                onChange={setIsContentRemovalConfirmed}
              />
            </DeleteDatabaseModalSection>
          </>
        )}
        {shouldShowDbNameInputConfirmation && (
          <>
            <DeleteDatabaseModalSection>
              <Alert icon="warning" variant="error">
                {t`This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone! `}
              </Alert>
            </DeleteDatabaseModalSection>
            <DeleteDatabaseModalSection>
              <p>
                {t`If you're sure, please type`}{" "}
                <strong>{database.name}</strong> {t`in this box:`}
              </p>
              <Input
                data-testid="database-name-confirmation-input"
                autoFocus
                value={databaseNameConfirmation}
                onChange={e => setDatabaseNameConfirmation(e.target.value)}
              />
            </DeleteDatabaseModalSection>
          </>
        )}
        <DeleteDatabaseModalFooter>
          {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
          <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          <Button danger type="submit" disabled={!canDelete}>
            {deleteButtonLabel}
          </Button>
        </DeleteDatabaseModalFooter>
      </DeleteDatabaseModalRoot>
    </ModalContent>
  );
};

export default DeleteDatabaseModal;
