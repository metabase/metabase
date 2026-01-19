import type { FormEvent, MouseEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { useAsync } from "react-use";
import { jt, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { MetabaseApi } from "metabase/services";
import {
  Alert,
  Box,
  type BoxProps,
  Button,
  Flex,
  Icon,
  Input,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Database, DatabaseUsageInfo } from "metabase-types/api";

import ContentRemovalConfirmation from "../ContentRemovalConfirmation";

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
  const dispatch = useDispatch();

  const { value: usageInfo, loading } = useAsync(
    async () =>
      (await MetabaseApi.db_usage_info({
        dbId: database.id,
      })) as DatabaseUsageInfo,
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
    dispatch(push(Urls.editDatabase(database.id)));
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

  const databaseNameConfirmationRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isContentRemovalConfirmed || !hasContent) {
      databaseNameConfirmationRef.current?.focus();
    }
  }, [isContentRemovalConfirmed, hasContent]);

  return (
    <Modal
      opened={opened}
      title={title || t`Delete the ${database.name} database?`}
      onClose={onClose}
      padding="xl"
      {...props}
    >
      <LoadingAndErrorWrapper loading={loading}>
        <Stack
          component="form"
          mt="md"
          gap="md"
          onSubmit={canDelete ? handleSubmit : undefined}
        >
          {hasContent && (
            <DeleteDatabaseModalSection isHidden={isContentRemovalConfirmed}>
              <Alert color="info" icon={<Icon name="info" />}>
                <Text>
                  {jt`If you’re trying to migrate from a development DB to a production one, you don’t need to do this. You can just ${(
                    <UnstyledButton
                      key="button"
                      onClick={handleEditConnectionDetailsClick}
                      c="brand"
                      fw="bold"
                    >{t`edit your connection details.`}</UnstyledButton>
                  )}`}
                </Text>
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
            <Alert icon={<Icon name="warning" />} color="error">
              <Text>{defaultDatabaseRemovalMessage}</Text>
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
            <Input
              w="20rem"
              data-testid="database-name-confirmation-input"
              data-autofocus="true"
              placeholder={t`Are you completely sure?`}
              value={databaseNameConfirmation}
              ref={databaseNameConfirmationRef}
              onChange={(e) => setDatabaseNameConfirmation(e.target.value)}
            />
          </DeleteDatabaseModalSection>
          <Flex gap="sm" justify="flex-end" align="center">
            {errorMessage && (
              <Box c="error" px="md">
                {errorMessage}
              </Box>
            )}
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <Button
              color="error"
              variant="filled"
              type="submit"
              disabled={!canDelete}
            >
              {deleteButtonLabel}
            </Button>
          </Flex>
        </Stack>
      </LoadingAndErrorWrapper>
    </Modal>
  );
};

export const DeleteDatabaseModalSection = ({
  isHidden,
  ...props
}: { isHidden?: boolean; children: React.ReactNode } & BoxProps) => {
  return (
    <Box
      h={isHidden ? 0 : "unset"}
      opacity={isHidden ? 0 : 1}
      p="xs"
      style={{
        transition: "all 350ms, opacity 200ms",
        overflow: "hidden",
      }}
      {...props}
    />
  );
};
