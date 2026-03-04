import { memo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Group,
  Icon,
  Loader,
  Stack,
  type StackProps,
  Text,
  Tooltip,
} from "metabase/ui";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

import { FieldOrderPicker } from "../FieldOrderPicker";
import { NameDescriptionInput } from "../NameDescriptionInput";
import { ResponsiveButton } from "../ResponsiveButton";
import { TableFieldList } from "../TableFieldList";
import { TableSortableFieldList } from "../TableSortableFieldList";

import S from "./TableSection.module.css";
import { useResponsiveButtons } from "./hooks";

type TableSectionBaseProps = {
  table: Table;
  fieldId: FieldId | undefined;
  withName?: boolean;
  getFieldHref: (fieldId: FieldId) => string;
  onSyncOptionsClick: () => void;
} & StackProps;

const TableSectionBase = ({
  table,
  fieldId,
  withName,
  getFieldHref,
  onSyncOptionsClick,
  ...props
}: TableSectionBaseProps) => {
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isUpdatingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const {
    buttonsContainerRef,
    showButtonLabel,
    setDoneButtonWidth,
    setSortingButtonWidth,
    setSyncButtonWidth,
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
    <Stack data-testid="table-section" gap={0} pb="lg" px="lg" {...props}>
      <Stack
        className={S.header}
        gap="lg"
        pb={12}
        pos="sticky"
        pt="lg"
        top={0}
        bg="background-secondary"
      >
        {withName && (
          <NameDescriptionInput
            description={table.description ?? ""}
            descriptionPlaceholder={t`Give this table a description`}
            name={table.display_name}
            nameIcon="table2"
            nameMaxLength={254}
            namePlaceholder={t`Give this table a name`}
            nameRightSection={
              <Tooltip label={t`Go to this table`} position="top">
                <ActionIcon
                  component={Link}
                  to={Urls.queryBuilderTable(table.id, table.db_id)}
                  variant="subtle"
                  color="text-tertiary"
                  size="sm"
                  mr="sm"
                  aria-label={t`Go to this table`}
                >
                  <Icon name="external" size={16} />
                </ActionIcon>
              </Tooltip>
            }
            onNameChange={handleNameChange}
            onDescriptionChange={handleDescriptionChange}
          />
        )}

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
                showLabel={showButtonLabel}
                onClick={() => setIsSorting(true)}
                onRequestWidth={setSortingButtonWidth}
              >{t`Sorting`}</ResponsiveButton>
            )}

            {!isSorting && (
              <ResponsiveButton
                icon="gear_settings_filled"
                showLabel={showButtonLabel}
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
                showLabel={showButtonLabel}
                showIconWithLabel={false}
                onClick={() => setIsSorting(false)}
                onRequestWidth={setDoneButtonWidth}
              >
                {t`Done`}
              </ResponsiveButton>
            )}
          </Group>
        </Group>
      </Stack>

      <Stack gap="lg">
        <Stack gap={12}>
          {!hasFields && <EmptyState message={t`This table has no fields`} />}

          {isSorting && hasFields && (
            <TableSortableFieldList
              table={table}
              activeFieldId={fieldId}
              onChange={handleCustomFieldOrderChange}
            />
          )}

          {!isSorting && hasFields && (
            <TableFieldList
              table={table}
              activeFieldId={fieldId}
              getFieldHref={getFieldHref}
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};

export const TableSection = memo(TableSectionBase);
