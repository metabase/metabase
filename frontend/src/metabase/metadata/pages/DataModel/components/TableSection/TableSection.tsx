import { memo, useState } from "react";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { useToast } from "metabase/common/hooks";
import {
  FieldOrderPicker,
  NameDescriptionInput,
  SortableFieldList,
} from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Button, Group, Icon, Loader, Stack, Text } from "metabase/ui";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";

import { FieldList } from "./FieldList";
import S from "./TableSection.module.css";

interface Props {
  params: RouteParams;
  table: Table;
  onSyncOptionsClick: () => void;
}

const TableSectionBase = ({ params, table, onSyncOptionsClick }: Props) => {
  const { fieldId, ...parsedParams } = parseRouteParams(params);
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isChangingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const [sendToast] = useToast();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = table.fields && table.fields.length > 0;

  const handleNameChange = async (
    name: string,
    previousName = table.display_name,
  ) => {
    const { error } = await updateTable({
      id: table.id,
      display_name: name,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update table name`,
      });
    } else {
      sendToast({
        action: () => handleNameChange(previousName, name),
        icon: "check",
        message: t`Table name updated`,
      });
    }
  };

  const handleDescriptionChange = async (
    description: string,
    previousDescription = table.description ?? "",
  ) => {
    const { error } = await updateTable({ id: table.id, description });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update table description`,
      });
    } else {
      sendToast({
        action: () => handleDescriptionChange(previousDescription, description),
        icon: "check",
        message: t`Table description updated`,
      });
    }
  };

  const handleFieldOrderTypeChange = async (
    fieldOrder: TableFieldOrder,
    previousFieldOrder = table.field_order,
  ) => {
    const { error } = await updateTableSorting({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update field order`,
      });
    } else {
      sendToast({
        action: () =>
          handleFieldOrderTypeChange(previousFieldOrder, fieldOrder),
        icon: "check",
        message: t`Field order updated`,
      });
    }
  };

  const handleCustomFieldOrderChange = async (
    fieldOrder: FieldId[],
    previousFieldOrder = table.fields?.map(getRawTableFieldId) ?? [],
  ) => {
    const { error } = await updateTableFieldsOrder({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update field order`,
      });
    } else {
      sendToast({
        action: () =>
          handleCustomFieldOrderChange(previousFieldOrder, fieldOrder),
        icon: "check",
        message: t`Field order updated`,
      });
    }
  };

  return (
    <Stack data-testid="table-section" gap={0} pb="xl">
      <Box
        bg="accent-gray-light"
        className={S.header}
        pb="lg"
        pos="sticky"
        pt="xl"
        px="xl"
        top={0}
      >
        <NameDescriptionInput
          description={table.description ?? ""}
          descriptionPlaceholder={t`Give this table a description`}
          name={table.display_name}
          nameIcon="table2"
          nameMaxLength={254}
          namePlaceholder={t`Give this table a name`}
          onDescriptionChange={handleDescriptionChange}
          onNameChange={handleNameChange}
        />
      </Box>

      <Stack gap="lg" px="xl">
        <Stack gap={12}>
          <Group align="center" gap="md" justify="space-between">
            <Text flex="0 0 auto" fw="bold">{t`Fields`}</Text>

            <Group
              className={S.buttons}
              flex="1"
              gap="md"
              justify="flex-end"
              wrap="nowrap"
            >
              {isChangingSorting && (
                <Loader size="xs" data-testid="loading-indicator" />
              )}

              {!isSorting && hasFields && (
                <Button
                  h={32}
                  leftSection={<Icon name="sort_arrows" />}
                  px="sm"
                  py="xs"
                  size="xs"
                  onClick={() => setIsSorting(true)}
                >{t`Sorting`}</Button>
              )}

              {!isSorting && (
                <Button
                  h={32}
                  leftSection={<Icon name="gear_settings_filled" />}
                  px="sm"
                  py="xs"
                  size="xs"
                  onClick={onSyncOptionsClick}
                >{t`Sync options`}</Button>
              )}

              {isSorting && (
                <FieldOrderPicker
                  value={table.field_order}
                  onChange={handleFieldOrderTypeChange}
                />
              )}

              {isSorting && (
                <Button
                  h={32}
                  px="md"
                  py="xs"
                  size="xs"
                  onClick={() => setIsSorting(false)}
                >{t`Done`}</Button>
              )}
            </Group>
          </Group>

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
    </Stack>
  );
};

export const TableSection = memo(TableSectionBase);
