import { useElementSize } from "@mantine/hooks";
import { memo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import {
  FieldOrderPicker,
  NameDescriptionInput,
  SortableFieldList,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
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

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";
import { ResponsiveButton } from "../ResponsiveButton";
import { PublishModelsModal } from "../TablePicker/components/PublishModelsModal";
import { SubstituteModelModal } from "../TablePicker/components/SubstituteModelModal";

import { FieldList } from "./FieldList";
import { TableMetadataSection } from "./TableMetadataSection";
import { TableModels } from "./TableModels";
import S from "./TableSection.module.css";
import { useResponsiveButtons } from "./hooks";

interface Props {
  params: RouteParams;
  table: Table;
  onSyncOptionsClick: () => void;
}

const TableSectionBase = ({ params, table, onSyncOptionsClick }: Props) => {
  const { fieldId, ...parsedParams } = parseRouteParams(params);
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isUpdatingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const [isSubstituteModelModalOpen, setIsSubstituteModelModalOpen] =
    useState(false);
  const { height: headerHeight, ref: headerRef } = useElementSize();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const {
    buttonsContainerRef,
    showButtonLabel,
    setDoneButtonWidth,
    setSortingButtonWidth,
  } = useResponsiveButtons({
    hasFields,
    isSorting,
    isUpdatingSorting,
  });

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

  return (
    <Stack data-testid="table-section" gap="md" pb="xl">
      <Box
        className={S.header}
        bg="accent-gray-light"
        px="xl"
        mt="xl"
        pos="sticky"
        ref={headerRef}
        top={0}
      >
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

      <Box px="xl">
        <Group justify="stretch" gap="sm">
          {!isSorting && (
            <Box style={{ flexGrow: 1 }}>
              <Tooltip label={t`Sync options`}>
                <Button
                  leftSection={<Icon name="settings" />}
                  onClick={onSyncOptionsClick}
                  style={{
                    width: "100%",
                  }}
                >
                  {t`Sync settings`}
                </Button>
              </Tooltip>
            </Box>
          )}
          <Box style={{ flexGrow: 1 }}>
            <Tooltip label={t`Create model and publish to collection`}>
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
          <Button
            component={Link}
            onClick={(event) => {
              event.preventDefault();
            }}
            to={`/bench/dependencies?id=${table.id}&type=table`}
            disabled
            p="sm"
            leftSection={
              <Tooltip label={t`Dependency graph`}>
                <Icon name="network" c="text-light" />
              </Tooltip>
            }
            style={{
              backgroundColor: "var(--mb-color-accent-gray-light)",
              flexGrow: 0,
              width: 40,
            }}
          />
          <Box style={{ flexGrow: 0, width: 40 }}>
            <TableLink table={table} />
          </Box>
        </Group>
      </Box>

      <Box px="xl">
        <TransformLink table={table} />
      </Box>

      <Box px="xl">
        <Box className={S.box}>
          <TableMetadataSection table={table} />
        </Box>
      </Box>

      <Box px="xl">
        <TableModels table={table} />
      </Box>

      <Box
        bg="accent-gray-light"
        className={S.header}
        pos="sticky"
        top={headerHeight - 8}
        pb={12}
        px="xl"
      >
        <Group
          align="center"
          gap="md"
          justify="space-between"
          miw={0}
          top={0}
          wrap="nowrap"
        >
          <Text flex="0 0 auto" fw="bold">{t`Fields`}</Text>

          <Group
            flex="1"
            gap="md"
            justify="flex-end"
            miw={0}
            ref={buttonsContainerRef}
            wrap="nowrap"
          >
            {/* keep these conditions in sync with getRequiredWidth in useResponsiveButtons */}

            {isUpdatingSorting && (
              <Loader data-testid="loading-indicator" size="xs" />
            )}

            {!isSorting && hasFields && (
              <ResponsiveButton
                icon="sort_arrows"
                showLabel={showButtonLabel}
                onClick={() => setIsSorting(true)}
                onRequestWidth={setSortingButtonWidth}
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
                showLabel={showButtonLabel}
                showIconWithLabel={false}
                onClick={() => setIsSorting(false)}
                onRequestWidth={setDoneButtonWidth}
              >{t`Done`}</ResponsiveButton>
            )}
          </Group>
        </Group>
      </Box>

      <Stack gap="lg" px="xl">
        <Stack gap={12}>
          {!hasFields && <EmptyState message={t`This table has no fields`} />}

          {isSorting && hasFields && (
            <SortableFieldList
              activeFieldId={fieldId}
              table={table}
              onChange={handleCustomFieldOrderChange}
            />
          )}

          {!isSorting && hasFields && (
            <FieldList
              activeFieldId={fieldId}
              getFieldHref={(fieldId) => getUrl({ ...parsedParams, fieldId })}
              table={table}
            />
          )}
        </Stack>
      </Stack>

      <PublishModelsModal
        tables={new Set([table.id])}
        isOpen={isCreateModelsModalOpen}
        onClose={() => setIsCreateModelsModalOpen(false)}
      />

      <SubstituteModelModal
        tableId={table.id}
        isOpen={isSubstituteModelModalOpen}
        onClose={() => setIsSubstituteModelModalOpen(false)}
      />
    </Stack>
  );
};

function TableLink({ table }: { table: Table }) {
  return (
    <Tooltip label={t`Go to this table`} position="top">
      <Box>
        <Button
          component={Link}
          to={getQueryBuilderUrl(table)}
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

function TransformLink({ table }: { table: Table }) {
  const shouldShowTransform =
    table.transform_id != null && table.data_source === "metabase-transform";

  if (!shouldShowTransform) {
    return null;
  }

  return (
    <Box
      component={Link}
      to={`/admin/transforms?id=${table.transform_id}`}
      p="sm"
      style={{
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
        textDecoration: "none",
        backgroundColor: "rgba(5, 114, 210, 0.07)",
      }}
    >
      <Text
        size="sm"
        fw="bold"
        c="text-dark"
        style={{
          fontSize: 12,
          lineHeight: "16px",
        }}
      >
        {t`Generated by a transform`}
      </Text>
    </Box>
  );
}

function getQueryBuilderUrl(table: Table) {
  return `/question#?db=${table.db_id}&table=${table.id}`;
}

export const TableSection = memo(TableSectionBase);
