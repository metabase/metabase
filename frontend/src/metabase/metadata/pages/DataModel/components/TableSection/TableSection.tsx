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
import { Box, Group, Loader, Stack, Text } from "metabase/ui";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";
import { ResponsiveButton } from "../ResponsiveButton";

import { FieldList } from "./FieldList";
import S from "./TableSection.module.css";
import { useResponsiveButtons } from "./hooks";

const OUTLINE_SAFETY_MARGIN = 2;

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
  const [sendToast] = useToast();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const {
    buttonsContainerRef,
    showButtonLabels,
    setSortingButtonWidth,
    setSyncButtonWidth,
    setDoneButtonWidth,
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
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update table name`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Table name updated`,
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTable({ id: table.id, description });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update table description`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Table description updated`,
      });
    }
  };

  const handleFieldOrderTypeChange = async (fieldOrder: TableFieldOrder) => {
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
        icon: "check",
        message: t`Field order updated`,
      });
    }
  };

  const handleCustomFieldOrderChange = async (fieldOrder: FieldId[]) => {
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

      <Stack gap="lg" px="xl" pt={OUTLINE_SAFETY_MARGIN}>
        <Stack gap={12}>
          <Group
            align="center"
            gap="md"
            justify="space-between"
            miw={0}
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
                  showLabel={showButtonLabels}
                  onClick={() => setIsSorting(true)}
                  onRequestWidth={setSortingButtonWidth}
                >{t`Sorting`}</ResponsiveButton>
              )}

              {!isSorting && (
                <ResponsiveButton
                  icon="gear_settings_filled"
                  showLabel={showButtonLabels}
                  onClick={onSyncOptionsClick}
                  onRequestWidth={setSyncButtonWidth}
                >{t`Sync options`}</ResponsiveButton>
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
                  showLabel={showButtonLabels}
                  showIconWithLabel={false}
                  onClick={() => setIsSorting(false)}
                  onRequestWidth={setDoneButtonWidth}
                >{t`Done`}</ResponsiveButton>
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
