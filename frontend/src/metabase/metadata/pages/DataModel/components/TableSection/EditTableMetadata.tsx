import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { jt, t } from "ttag";

import { useEditTablesMutation } from "metabase/api";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, Title, Tooltip } from "metabase/ui";
import type {
  TableDataLayer,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import { useSelection } from "../../contexts/SelectionContext";
import { SyncOptionsModal } from "../SyncOptionsModal";
import { PublishModelsModal } from "../TablePicker/components/PublishModelsModal";

import S from "./TableMetadataSection.module.css";

export function EditTableMetadata() {
  const {
    selectedTables,
    selectedSchemas,
    selectedDatabases,
    selectedItemsCount,
  } = useSelection();
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [editTables] = useEditTablesMutation();
  const [dataLayer, setDataLayer] = useState<TableDataLayer | null>(null);
  const [dataSource, setDataSource] = useState<
    TableDataSource | "unknown" | null
  >(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<UserId | "unknown" | null>(null);
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();

  const handleSubmit = async ({
    dataLayer,
    dataSource,
    email,
    userId,
  }: {
    dataLayer?: TableDataLayer | null;
    dataSource?: TableDataSource | "unknown" | null;
    email?: string | null;
    userId?: UserId | "unknown" | null;
  }) => {
    const { error } = await editTables({
      table_ids: Array.from(selectedTables),
      schema_ids: Array.from(selectedSchemas),
      database_ids: Array.from(selectedDatabases),
      data_layer: dataLayer ?? undefined,
      data_source: dataSource === "unknown" ? null : (dataSource ?? undefined),
      owner_email:
        userId === "unknown" || typeof userId === "number"
          ? null
          : (email ?? undefined),
      owner_user_id: userId === "unknown" ? null : (userId ?? undefined),
    });

    // onUpdate?.();

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
  };

  return (
    <>
      <Stack gap="md">
        <Group
          align="center"
          c="text-light"
          gap={10}
          flex="1"
          fs="lg"
          lh="normal"
          wrap="nowrap"
          mt="xl"
          px="xl"
          pt="md"
          justify="space-between"
        >
          <Title
            order={4}
            c="text-dark"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Icon name="table2" size={20} />
            {jt`${selectedItemsCount} item${selectedItemsCount === 1 ? "" : "s"} selected`}
          </Title>
        </Group>

        <Box px="xl">
          <Group gap="sm">
            <Box flex={1}>
              <Button
                leftSection={<Icon name="settings" />}
                onClick={openSyncModal}
                style={{
                  width: "100%",
                }}
              >
                {t`Sync settings`}
              </Button>
            </Box>
            <Box flex={1}>
              <Tooltip label={t`Create models and publish to a collection`}>
                <Button
                  onClick={() => setIsCreateModelsModalOpen(true)}
                  p="sm"
                  leftSection={<Icon name="add_folder" />}
                  style={{
                    width: "100%",
                  }}
                >{t`Publish`}</Button>
              </Tooltip>
            </Box>
          </Group>
        </Box>

        <Box className={S.container} px="xl">
          <LayerInput
            clearable
            value={dataLayer}
            onChange={(newDataLayer) =>
              handleSubmit({ dataLayer: newDataLayer })
            }
            className={S.gridLabelInput}
            styles={{
              label: {
                gridColumn: 1,
                fontWeight: "normal",
              },
              input: {
                gridColumn: 2,
              },
            }}
          />

          <UserInput
            clearable
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
                fontWeight: "normal",
              },
              input: {
                gridColumn: 2,
              },
            }}
          />

          <DataSourceInput
            clearable
            value={dataSource}
            onChange={(newDataSource) =>
              handleSubmit({ dataSource: newDataSource })
            }
            className={S.gridLabelInput}
            styles={{
              label: {
                gridColumn: 1,
                fontWeight: "normal",
              },
              input: {
                gridColumn: 2,
              },
            }}
          />
        </Box>
      </Stack>
      <PublishModelsModal
        tables={selectedTables}
        schemas={selectedSchemas}
        databases={selectedDatabases}
        isOpen={isCreateModelsModalOpen}
        onClose={() => setIsCreateModelsModalOpen(false)}
      />

      <SyncOptionsModal
        isOpen={isSyncModalOpen}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onClose={closeSyncModal}
      />
    </>
  );
}
