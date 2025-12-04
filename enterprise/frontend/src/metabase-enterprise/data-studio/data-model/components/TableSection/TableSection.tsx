import { memo, useContext, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import * as Urls from "metabase/lib/urls";
import { dependencyGraph } from "metabase/lib/urls/dependencies";
import {
  FieldOrderPicker,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { DataModelContext } from "metabase/metadata/pages/shared/DataModelContext";
import { ResponsiveButton } from "metabase/metadata/pages/shared/ResponsiveButton";
import { getUrl } from "metabase/metadata/pages/shared/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

import { useDataModelApi } from "../../pages/DataModel/contexts/DataModelApiContext";
import { PublishModelsModal } from "../TablePicker/components/PublishModelsModal";

import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableFieldList } from "./TableFieldList";
import { TableMetadata } from "./TableMetadata";
import { TableModels } from "./TableModels";
import S from "./TableSection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";
import { TableSortableFieldList } from "./TableSortableFieldList";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  onSyncOptionsClick: () => void;
}

const TableSectionBase = ({
  table,
  activeFieldId,
  onSyncOptionsClick,
}: Props) => {
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isUpdatingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const { baseUrl } = useContext(DataModelContext);
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const { invokeAction } = useDataModelApi();

  const getFieldHref = (fieldId: FieldId) => {
    return getUrl(baseUrl, {
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      fieldId,
    });
  };

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

  const handlePublishSuccess = () => {
    invokeAction("refetchSelectedTables");
  };

  return (
    <Stack data-testid="table-section" gap="md" pb="xl">
      <Box className={S.header} bg="accent-gray-light" px="lg" mt="lg">
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

      <Box px="lg">
        <Group justify="stretch" gap="sm">
          <Button
            flex="1"
            leftSection={<Icon name="settings" />}
            onClick={onSyncOptionsClick}
            style={{
              width: "100%",
            }}
          >
            {t`Sync settings`}
          </Button>
          <Button
            flex="1"
            onClick={() => setIsCreateModelsModalOpen(true)}
            p="sm"
            leftSection={<Icon name="add_folder" />}
            style={{
              width: "100%",
            }}
          >{t`Publish`}</Button>
          <Tooltip label={t`Dependency graph`}>
            <Box /* wrapping with a Box because Tooltip does not work for <Button component={Link} /> */
            >
              <Button
                component={Link}
                to={dependencyGraph({
                  entry: { id: Number(table.id), type: "table" },
                })}
                p="sm"
                leftSection={<Icon name="network" />}
                style={{
                  flexGrow: 0,
                  width: 40,
                }}
                aria-label={t`Dependency graph`}
              />
            </Box>
          </Tooltip>
          <Box style={{ flexGrow: 0, width: 40 }}>
            <TableLink table={table} />
          </Box>
        </Group>
      </Box>

      <Box px="lg">
        <TableAttributesEditSingle table={table} />
      </Box>

      <Box px="lg">
        <TableSectionGroup title={t`Metadata`}>
          <TableMetadata table={table} />
        </TableSectionGroup>
      </Box>

      {table.published_models != null && table.published_models.length > 0 && (
        <TableModels table={table} />
      )}

      <Box px="lg">
        <Stack gap={12}>
          <Group
            align="center"
            gap="md"
            justify="space-between"
            miw={0}
            wrap="nowrap"
            h={36}
          >
            <Text flex="0 0 auto" fw="bold">{t`Fields`}</Text>

            <Group
              flex="1"
              gap="md"
              justify="flex-end"
              miw={0}
              wrap="nowrap"
              h="100%"
            >
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
          </Group>

          {!hasFields && <EmptyState message={t`This table has no fields`} />}

          {/* NOTE: We're using here CSS display property to avoid scroll jump when toggling sorting mode. */}
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
      </Box>

      <PublishModelsModal
        tables={new Set([table.id])}
        isOpen={isCreateModelsModalOpen}
        onClose={() => setIsCreateModelsModalOpen(false)}
        onSuccess={handlePublishSuccess}
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
      <Box>
        {/* wrapping with a Box because Tooltip does not work for <Button component={Link} /> */}
        <Button
          component={Link}
          to={url}
          aria-label={t`Go to this table`}
          leftSection={<Icon name="external" size={16} />}
          style={{
            width: "100%",
          }}
        />
      </Box>
    </Tooltip>
  );
}

export const TableSection = memo(TableSectionBase);
