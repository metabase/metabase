import type { FormEvent, MouseEventHandler } from "react";
import { useState } from "react";
import { useAsync } from "react-use";
import { jt, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import Alert from "metabase/core/components/Alert";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import { MetabaseApi } from "metabase/services";
import type { Database, DatabaseUsageInfo } from "metabase-types/api";

import ContentRemovalConfirmation from "../ContentRemovalConfirmation";

import {
  DatabaseNameInputContainer,
  DeleteDatabaseModalFooter,
  DeleteDatabaseModalRoot,
  DeleteDatabaseModalSection,
  ErrorMessage,
} from "./DeleteDatabaseModal.styled";

const entityTypesCount = (usageInfo: DatabaseUsageInfo) => {
  return Object.values(usageInfo).filter((value) => value > 0).length;
};

const hasContentInDatabase = (usageInfo: DatabaseUsageInfo) => {
  return entityTypesCount(usageInfo) > 0;
};

const getErrorMessage = (error: any) => {
  if (!error) {
    return null;
  }

  let errorMessage = t`Server error encountered`;
  if (error.data && error.data.message) {
    errorMessage = error.data.message;
  } else if (error.message) {
    errorMessage = error.message;
  }

  return errorMessage;
};

export interface DeleteDatabaseModalProps {
  title: string;
  defaultDatabaseRemovalMessage: string;
  onClose: () => void;
  onDelete: () => Promise<void>;
  database: Pick<Database, "id" | "name" | "router_user_attribute">;
}

export const DeleteDatabaseModal = ({
  database,
  title,
  defaultDatabaseRemovalMessage,
  onClose,
  onDelete,
}: DeleteDatabaseModalProps) => {
  const { value: usageInfo, loading } = useAsync(
    async () => await MetabaseApi.db_usage_info({ dbId: database.id }),
  );

  const [isContentRemovalConfirmed, setIsContentRemovalConfirmed] =
    useState(false);

  const [databaseNameConfirmation, setDatabaseNameConfirmation] = useState("");
  const [error, setError] = useState<any>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      await onDelete();
      onClose();
    } catch (error) {
      setError(error);
    }
  };

  const handleEditConnectionDetailsClick: MouseEventHandler = (e) => {
    e.preventDefault();
    onClose();
  };

  const hasContent = usageInfo && hasContentInDatabase(usageInfo);

  const isDatabaseNameConfirmed =
    databaseNameConfirmation.trim().toLowerCase() ===
    database.name.trim().toLowerCase();
  const canDelete =
    (isContentRemovalConfirmed || !hasContent) && isDatabaseNameConfirmed;

  const deleteButtonLabel = hasContent
    ? t`Delete this content and the DB connection`
    : t`Delete`;

  const errorMessage = getErrorMessage(error);
  const hasMoreThanOneEntityType = usageInfo && entityTypesCount(usageInfo) > 1;

  return (
    <ModalContent
      title={title || t`Delete the ${database.name} database?`}
      onClose={onClose}
    >
      <LoadingAndErrorWrapper loading={loading}>
        <DeleteDatabaseModalRoot
          onSubmit={canDelete ? handleSubmit : undefined}
        >
          {hasContent && (
            <DeleteDatabaseModalSection isHidden={isContentRemovalConfirmed}>
              <Alert icon="info">
                {jt`If you’re trying to migrate from a development DB to a production one, you don’t need to do this. You can just ${(
                  <Button
                    key="button"
                    onlyText
                    onClick={handleEditConnectionDetailsClick}
                  >{t`edit your connection details.`}</Button>
                )}`}
              </Alert>
            </DeleteDatabaseModalSection>
          )}
          {hasContent && (
            <>
              <DeleteDatabaseModalSection>
                {hasMoreThanOneEntityType
                  ? t`Deleting this database will also delete everything based on it. If you’re really trying to do this, please check each of these boxes:`
                  : t`Deleting this database will also delete everything based on it. If you’re really trying to do this, please check the box below:`}
              </DeleteDatabaseModalSection>

              <DeleteDatabaseModalSection>
                <ContentRemovalConfirmation
                  usageInfo={usageInfo}
                  onChange={setIsContentRemovalConfirmed}
                />
              </DeleteDatabaseModalSection>
            </>
          )}
          <DeleteDatabaseModalSection
            isHidden={!isContentRemovalConfirmed && hasContent}
          >
            <Alert icon="warning" variant="error">
              {defaultDatabaseRemovalMessage}
            </Alert>
          </DeleteDatabaseModalSection>
          <DeleteDatabaseModalSection
            isHidden={!isContentRemovalConfirmed && hasContent}
          >
            <p>
              {jt`If you’re sure, please type ${(
                <strong key="name">{database.name}</strong>
              )} in this box:`}
            </p>
            <DatabaseNameInputContainer>
              <Input
                fullWidth
                data-testid="database-name-confirmation-input"
                autoFocus
                placeholder={t`Are you completely sure?`}
                value={databaseNameConfirmation}
                onChange={(e) => setDatabaseNameConfirmation(e.target.value)}
              />
            </DatabaseNameInputContainer>
          </DeleteDatabaseModalSection>
          <DeleteDatabaseModalFooter>
            {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <Button danger type="submit" disabled={!canDelete}>
              {deleteButtonLabel}
            </Button>
          </DeleteDatabaseModalFooter>
        </DeleteDatabaseModalRoot>
      </LoadingAndErrorWrapper>
    </ModalContent>
  );
};
