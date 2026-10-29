import type { FormEvent, MouseEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { jt, t } from "ttag";

import { useGetDatabaseUsageInfoQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useNavigate } from "metabase/router";
import {
  Alert,
  Button,
  Icon,
  Input,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database, DatabaseUsageInfo } from "metabase-types/api";

import ContentRemovalConfirmation from "../ContentRemovalConfirmation";

const entityTypesCount = (usageInfo: DatabaseUsageInfo) => {
  return Object.values(usageInfo).filter((value) => value > 0).length;
};

const hasContentInDatabase = (usageInfo: DatabaseUsageInfo) => {
  return entityTypesCount(usageInfo) > 0;
};

const getDeleteErrorMessage = (error: unknown) =>
  error ? getErrorMessage(error, t`Server error encountered`) : null;

export interface DeleteDatabaseModalProps {
  opened: boolean;
  title: string;
  defaultDatabaseRemovalMessage: string;
  onClose: () => void;
  onDelete: () => Promise<void>;
  database: Pick<Database, "id" | "name" | "router_user_attribute">;
}

export const DeleteDatabaseModal = ({
  opened,
  database,
  title,
  defaultDatabaseRemovalMessage,
  onClose,
  onDelete,
  ...props
}: DeleteDatabaseModalProps) => {
  const navigate = useNavigate();

  const { data: usageInfo, isLoading: loading } = useGetDatabaseUsageInfoQuery(
    database.id,
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
    navigate(Urls.editDatabase(database.id));
  };

  const hasContent = usageInfo && hasContentInDatabase(usageInfo);

  const isDatabaseNameConfirmed =
    databaseNameConfirmation.trim().toLowerCase() ===
    database.name.trim().toLowerCase();
  const canConfirmName = isContentRemovalConfirmed || !hasContent;
  const canDelete = canConfirmName && isDatabaseNameConfirmed;

  const deleteButtonLabel = t`Delete this DB connection`;

  const errorMessage = getDeleteErrorMessage(error);
  const hasMoreThanOneEntityType = usageInfo && entityTypesCount(usageInfo) > 1;

  const databaseNameConfirmationRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (canConfirmName) {
      databaseNameConfirmationRef.current?.focus();
    }
  }, [canConfirmName, loading]);

  return (
    <Modal
      density="relaxed"
      opened={opened}
      title={title || t`Delete the ${database.name} database?`}
      onClose={onClose}
      {...props}
    >
      <LoadingAndErrorWrapper loading={loading}>
        <form onSubmit={canDelete ? handleSubmit : undefined}>
          <Stack gap="xl">
            {hasContent && !isContentRemovalConfirmed && (
              <Alert icon={<Icon name="info" />}>
                {jt`If you’re trying to migrate from a development DB to a production one, you don’t need to do this. You can just ${(
                  <UnstyledButton
                    key="button"
                    onClick={handleEditConnectionDetailsClick}
                    c="core-brand"
                    fw="bold"
                  >{t`edit your connection details.`}</UnstyledButton>
                )}`}
              </Alert>
            )}
            {hasContent && (
              <>
                <Text>
                  {hasMoreThanOneEntityType
                    ? t`Deleting this database will also delete everything based on it. If you’re really trying to do this, please check each of these boxes:`
                    : t`Deleting this database will also delete everything based on it. If you’re really trying to do this, please check the box below:`}
                </Text>
                <ContentRemovalConfirmation
                  usageInfo={usageInfo}
                  onChange={setIsContentRemovalConfirmed}
                />
              </>
            )}
            {canConfirmName && (
              <>
                <Alert
                  size="compact"
                  icon={<Icon name="warning" />}
                  color="error"
                >
                  {defaultDatabaseRemovalMessage}
                </Alert>
                <Stack gap="sm">
                  <Text>
                    {jt`If you’re sure, please type ${(
                      <strong key="name">{database.name}</strong>
                    )} in this box:`}
                  </Text>
                  <Input
                    w="20rem"
                    data-testid="database-name-confirmation-input"
                    data-autofocus="true"
                    placeholder={t`Are you completely sure?`}
                    value={databaseNameConfirmation}
                    ref={databaseNameConfirmationRef}
                    onChange={(e) =>
                      setDatabaseNameConfirmation(e.target.value)
                    }
                  />
                </Stack>
              </>
            )}
          </Stack>
          <Modal.Footer>
            {errorMessage && (
              <Text c="feedback-negative" flex={1}>
                {errorMessage}
              </Text>
            )}
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <Button
              color="negative"
              variant="filled"
              type="submit"
              disabled={!canDelete}
            >
              {deleteButtonLabel}
            </Button>
          </Modal.Footer>
        </form>
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
