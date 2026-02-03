import { memo, useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { DataStudioTableMetadataTab } from "metabase/lib/urls/data-studio";
import { dependencyGraph } from "metabase/lib/urls/dependencies";
import {
  FieldOrderPicker,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { ResponsiveButton } from "metabase/metadata/components/ResponsiveButton";
import { TableFieldList } from "metabase/metadata/components/TableFieldList";
import { TableSortableFieldList } from "metabase/metadata/components/TableSortableFieldList";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_LIBRARY,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Tabs,
  Tooltip,
} from "metabase/ui";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

import S from "./TableSection.module.css";
import { MeasureList } from "./components/MeasureList";
import { SegmentList } from "./components/SegmentList";
import { TableAttributesEditSingle } from "./components/TableAttributesEditSingle";
import { TableCollection } from "./components/TableCollection";
import { TableMetadata } from "./components/TableMetadata";
import { TableSectionGroup } from "./components/TableSectionGroup";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  activeTab: DataStudioTableMetadataTab;
  canPublish: boolean;
  hasLibrary: boolean;
  onSyncOptionsClick: () => void;
}

type TableModalType = "library" | "publish" | "unpublish";

const TableSectionBase = ({
  table,
  activeFieldId,
  activeTab,
  canPublish,
  hasLibrary,
  onSyncOptionsClick,
}: Props) => {
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isUpdatingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const [modalType, setModalType] = useState<TableModalType>();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const isLibraryEnabled = PLUGIN_LIBRARY.isEnabled;
  const isDependencyGraphEnabled = PLUGIN_DEPENDENCIES.isEnabled;
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const getFieldHref = (fieldId: FieldId) => {
    return Urls.dataStudioData({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      tab: "field",
      fieldId,
    });
  };

  const dispatch = useDispatch();

  const handleTabChange = useCallback(
    (tab: string | null) => {
      if (!Urls.isDataStudioTableMetadataTab(tab)) {
        return;
      }

      dispatch(
        push(
          Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            tab,
          }),
        ),
      );
    },
    [dispatch, table.db_id, table.schema, table.id],
  );

  const handleNameChange = async (name: string) => {
    const { error } = await updateTable({
      id: table.id,
      display_name: name,
    });

    if (error) {
      sendErrorToast(t`Failed to update table name`);
    } else {
      sendSuccessToast(t`Table name updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          display_name: table.display_name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTable({ id: table.id, description });

    if (error) {
      sendErrorToast(t`Failed to update table description`);
    } else {
      sendSuccessToast(t`Table description updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          description: table.description ?? "",
        });
        sendUndoToast(error);
      });
    }
  };

  const handleFieldOrderTypeChange = async (fieldOrder: TableFieldOrder) => {
    const { error } = await updateTableSorting({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          field_order: table.field_order,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleCustomFieldOrderChange = async (fieldOrder: FieldId[]) => {
    const { error } = await updateTableFieldsOrder({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        const { error: fieldsOrderError } = await updateTableFieldsOrder({
          id: table.id,
          field_order: table.fields?.map(getRawTableFieldId) ?? [],
        });

        if (table.field_order !== "custom") {
          const { error: tableError } = await updateTable({
            id: table.id,
            field_order: table.field_order,
          });
          sendUndoToast(fieldsOrderError ?? tableError);
        } else {
          sendUndoToast(fieldsOrderError);
        }
      });
    }
  };

  const handlePublishToggle = () => {
    if (!hasLibrary) {
      setModalType("library");
    } else {
      setModalType(table.is_published ? "unpublish" : "publish");
    }
  };

  const handleCloseModal = () => {
    setModalType(undefined);
  };

  return (
    <Stack data-testid="table-section" gap="md" pb="xl">
      <Box className={S.header}>
        <NameDescriptionInput
          description={table.description ?? ""}
          descriptionPlaceholder={t`Give this table a description`}
          name={table.display_name}
          nameIcon="table2"
          nameMaxLength={254}
          namePlaceholder={t`Give this table a name`}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>

      <Group justify="stretch" gap="sm">
        {canPublish && isLibraryEnabled && !remoteSyncReadOnly && (
          <Button
            flex="1"
            p="sm"
            leftSection={
              <Icon name={table.is_published ? "unpublish" : "publish"} />
            }
            onClick={handlePublishToggle}
          >
            {table.is_published ? t`Unpublish` : t`Publish`}
          </Button>
        )}
        <Button
          flex="1"
          leftSection={<Icon name="settings" />}
          onClick={onSyncOptionsClick}
        >
          {t`Sync settings`}
        </Button>
        {isDependencyGraphEnabled && (
          <Tooltip label={t`Dependency graph`}>
            <Button
              component={ForwardRefLink}
              to={dependencyGraph({
                entry: { id: Number(table.id), type: "table" },
              })}
              p="sm"
              leftSection={<Icon name="dependencies" />}
              style={{
                flexGrow: 0,
                width: 40,
              }}
              aria-label={t`Dependency graph`}
            />
          </Tooltip>
        )}

        <Tooltip label={t`Schema viewer`}>
          <Button
            component={ForwardRefLink}
            to={Urls.dataStudioErd(table.id)}
            p="sm"
            leftSection={<Icon name="dependencies" />}
            style={{
              flexGrow: 0,
              width: 40,
            }}
            aria-label={t`Schema viewer`}
          />
        </Tooltip>
        <Box style={{ flexGrow: 0, width: 40 }}>
          <TableLink table={table} />
        </Box>
      </Group>

      <TableAttributesEditSingle table={table} />

      <TableSectionGroup title={t`Metadata`}>
        <TableMetadata table={table} />
      </TableSectionGroup>

      {table.is_published && <TableCollection table={table} />}

      <Box>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List mb="md">
            <Tabs.Tab
              value="field"
              leftSection={<Icon name="list" />}
            >{t`Fields`}</Tabs.Tab>
            <Tabs.Tab
              value="segments"
              leftSection={<Icon name="segment2" />}
            >{t`Segments`}</Tabs.Tab>
            <Tabs.Tab
              value="measures"
              leftSection={<Icon name="sum" />}
            >{t`Measures`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="field">
            <Stack gap="md">
              <Group gap="md" justify="flex-start" wrap="nowrap">
                {isUpdatingSorting && (
                  <Loader data-testid="loading-indicator" size="xs" />
                )}

                {!isSorting && hasFields && (
                  <ResponsiveButton
                    icon="sort_arrows"
                    showLabel
                    onClick={() => setIsSorting(true)}
                  >{t`Sorting`}</ResponsiveButton>
                )}

                {isSorting && (
                  <FieldOrderPicker
                    value={table.field_order}
                    onChange={handleFieldOrderTypeChange}
                  />
                )}

                {isSorting && (
                  <ResponsiveButton
                    icon="check"
                    showLabel
                    onClick={() => setIsSorting(false)}
                  >{t`Done`}</ResponsiveButton>
                )}
              </Group>

              {!hasFields && (
                <EmptyState
                  className={S.EmptyState}
                  message={t`This table has no fields`}
                  spacing="sm"
                />
              )}

              {hasFields && (
                <>
                  <Box
                    style={{
                      display: isSorting ? "block" : "none",
                    }}
                    aria-hidden={!isSorting}
                  >
                    <TableSortableFieldList
                      activeFieldId={activeFieldId}
                      table={table}
                      onChange={handleCustomFieldOrderChange}
                    />
                  </Box>

                  <Box
                    style={{
                      display: isSorting ? "none" : "block",
                    }}
                    aria-hidden={isSorting}
                  >
                    <TableFieldList
                      table={table}
                      activeFieldId={activeFieldId}
                      getFieldHref={getFieldHref}
                    />
                  </Box>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="segments">
            <SegmentList table={table} />
          </Tabs.Panel>

          <Tabs.Panel value="measures">
            <MeasureList table={table} />
          </Tabs.Panel>
        </Tabs>
      </Box>

      <PLUGIN_LIBRARY.CreateLibraryModal
        title={t`First, let's create your Library`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={modalType === "library"}
        onCreate={() => setModalType("publish")}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={modalType === "publish"}
        tableIds={[table.id]}
        onPublish={handleCloseModal}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        tableIds={[table.id]}
        onUnpublish={handleCloseModal}
        onClose={handleCloseModal}
      />
    </Stack>
  );
};

function TableLink({ table }: { table: Table }) {
  const url =
    Urls.modelToUrl({
      id: Number(table.id),
      name: table.name,
      model: "table",
      database: { id: table.db_id },
    }) ?? "#";

  return (
    <Tooltip label={t`Go to this table`} position="top">
      <Button
        component={ForwardRefLink}
        to={url}
        aria-label={t`Go to this table`}
        leftSection={<Icon name="external" size={16} />}
        style={{
          width: "100%",
        }}
      />
    </Tooltip>
  );
}

export const TableSection = memo(TableSectionBase);
