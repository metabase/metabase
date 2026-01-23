import { useEffect, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import {
  DataSourceInput,
  EntityTypeInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, Title } from "metabase/ui";
import { useEditTablesMutation } from "metabase-enterprise/api";
import {
  trackDataStudioBulkAttributeUpdated,
  trackDataStudioBulkSyncSettingsClicked,
} from "metabase-enterprise/data-studio/analytics";
import { CreateLibraryModal } from "metabase-enterprise/data-studio/common/components/CreateLibraryModal";
import { PublishTablesModal } from "metabase-enterprise/data-studio/common/components/PublishTablesModal";
import { UnpublishTablesModal } from "metabase-enterprise/data-studio/common/components/UnpublishTablesModal";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  TableDataLayer,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import { useSelection } from "../../pages/DataModel/contexts/SelectionContext";
import { SyncOptionsModal } from "../SyncOptionsModal";

import S from "./TableAttributes.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

type TableAttributesEditBulkProps = {
  canPublish: boolean;
  hasLibrary: boolean;
  onUpdate: () => void;
};

type TableModalType = "library" | "publish" | "unpublish" | "sync";

export function TableAttributesEditBulk({
  canPublish,
  hasLibrary,
  onUpdate,
}: TableAttributesEditBulkProps) {
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const {
    selectedDatabases,
    selectedSchemas,
    selectedTables,
    selectedItemsCount,
  } = useSelection();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [editTables] = useEditTablesMutation();
  const [dataLayer, setDataLayer] = useState<TableDataLayer | null>(null);
  const [dataSource, setDataSource] = useState<
    TableDataSource | "unknown" | null
  >(null);
  const [email, setEmail] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [userId, setUserId] = useState<UserId | "unknown" | null>(null);
  const [modalType, setModalType] = useState<TableModalType>();

  const hasOnlyTablesSelected =
    selectedTables.size > 0 &&
    selectedSchemas.size === 0 &&
    selectedDatabases.size === 0;

  const handleSubmit = async ({
    dataLayer,
    dataSource,
    email,
    entityType,
    userId,
  }: {
    dataLayer?: TableDataLayer | null;
    dataSource?: TableDataSource | "unknown" | null;
    email?: string | null;
    entityType?: string | null;
    userId?: UserId | "unknown" | null;
  }) => {
    const { error } = await editTables({
      table_ids: Array.from(selectedTables),
      schema_ids: Array.from(selectedSchemas),
      database_ids: Array.from(selectedDatabases),
      entity_type: entityType ?? undefined,
      data_layer: dataLayer ?? undefined,
      data_source: dataSource === "unknown" ? null : (dataSource ?? undefined),
      owner_email:
        userId === "unknown" || typeof userId === "number"
          ? null
          : (email ?? undefined),
      owner_user_id: userId === "unknown" ? null : (userId ?? undefined),
    });

    const result = error ? "failure" : "success";

    if (email !== undefined || userId !== undefined) {
      trackDataStudioBulkAttributeUpdated("owner", result);
    }
    if (dataLayer !== undefined) {
      trackDataStudioBulkAttributeUpdated("layer", result);
    }
    if (entityType !== undefined) {
      trackDataStudioBulkAttributeUpdated("entity_type", result);
    }
    if (dataSource !== undefined) {
      trackDataStudioBulkAttributeUpdated("data_source", result);
    }

    if (error) {
      sendErrorToast(t`Failed to update items`);
    } else {
      sendSuccessToast(t`Items updated`);
    }

    if (dataLayer) {
      setDataLayer(dataLayer);
    }
    if (dataSource) {
      setDataSource(dataSource);
    }
    if (email) {
      setEmail(email);
    }
    if (userId) {
      setUserId(userId);
    }
    if (entityType) {
      setEntityType(entityType);
    }
    onUpdate();
  };

  const handleCloseModal = () => {
    setModalType(undefined);
  };

  const handleSuccessCloseModal = () => {
    onUpdate();
    handleCloseModal();
  };

  useEffect(() => {
    setDataLayer(null);
    setDataSource(null);
    setEmail(null);
    setEntityType(null);
    setUserId(null);
  }, [selectedTables, selectedSchemas, selectedDatabases]);

  return (
    <>
      <Stack gap="md">
        <Group
          align="center"
          c="text-tertiary"
          gap={10}
          flex="1"
          fs="lg"
          lh="normal"
          wrap="nowrap"
          px="lg"
          pt="lg"
          justify="space-between"
        >
          <Title
            order={4}
            c="text-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Icon name="collection2" size={20} />
            {hasOnlyTablesSelected
              ? t`${selectedItemsCount} tables selected`
              : t`Multiple tables selected`}
          </Title>
        </Group>

        <Box px="lg">
          <Group gap="sm">
            {canPublish && !remoteSyncReadOnly && (
              <Button
                flex={1}
                p="sm"
                leftSection={<Icon name="publish" />}
                onClick={() => setModalType(hasLibrary ? "publish" : "library")}
              >
                {t`Publish`}
              </Button>
            )}
            {canPublish && !remoteSyncReadOnly && hasLibrary && (
              <Button
                flex={1}
                p="sm"
                leftSection={<Icon name="unpublish" />}
                onClick={() => setModalType("unpublish")}
              >
                {t`Unpublish`}
              </Button>
            )}
            <Button
              flex={1}
              leftSection={<Icon name="settings" />}
              onClick={() => {
                trackDataStudioBulkSyncSettingsClicked();
                setModalType("sync");
              }}
            >
              {t`Sync settings`}
            </Button>
          </Group>
        </Box>

        <Box px="lg">
          <TableSectionGroup title={t`Attributes`}>
            <Box className={S.container}>
              <UserInput
                email={email}
                label={t`Owner`}
                userId={userId}
                onEmailChange={(newEmail) => {
                  handleSubmit({ email: newEmail });
                }}
                onUserIdChange={(newUserId) => {
                  handleSubmit({ userId: newUserId });
                }}
                className={S.gridLabelInput}
                styles={{
                  label: {
                    gridColumn: 1,
                  },
                  input: {
                    gridColumn: 2,
                  },
                }}
              />

              <LayerInput
                value={dataLayer}
                onChange={(newDataLayer) =>
                  handleSubmit({ dataLayer: newDataLayer })
                }
                className={S.gridLabelInput}
                styles={{
                  label: {
                    gridColumn: 1,
                  },
                  input: {
                    gridColumn: 2,
                  },
                }}
              />

              <EntityTypeInput
                value={entityType}
                onChange={(entityType) => handleSubmit({ entityType })}
                styles={{
                  label: {
                    gridColumn: 1,
                  },
                  input: {
                    gridColumn: 2,
                  },
                }}
                className={S.gridLabelInput}
              />

              <DataSourceInput
                disabled={dataSource === "metabase-transform"}
                value={dataSource}
                onChange={(newDataSource) =>
                  handleSubmit({ dataSource: newDataSource })
                }
                className={S.gridLabelInput}
                styles={{
                  label: {
                    gridColumn: 1,
                  },
                  input: {
                    gridColumn: 2,
                  },
                }}
              />
            </Box>
          </TableSectionGroup>
        </Box>
      </Stack>

      <CreateLibraryModal
        title={t`First, let's create your Library`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={modalType === "library"}
        onCreate={() => setModalType("publish")}
        onClose={handleCloseModal}
      />

      <PublishTablesModal
        isOpened={modalType === "publish"}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onPublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />

      <UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onUnpublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />

      <SyncOptionsModal
        isOpen={modalType === "sync"}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onClose={handleCloseModal}
      />
    </>
  );
}
