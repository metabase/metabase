import { memo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import * as Urls from "metabase/lib/urls";
import {
  FieldOrderPicker,
  NameDescriptionInput,
  SortableFieldList,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
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

import { FieldList } from "./FieldList";
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
    <Stack data-testid="table-section" gap={0} pb="xl">
      <Stack
        bg="accent-gray-light"
        className={S.header}
        gap="lg"
        pb={12}
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
          nameRightSection={
            <Tooltip label={t`Go to this table`} position="top">
              <ActionIcon
                component={Link}
                to={Urls.queryBuilderTable(table.id, table.db_id)}
                variant="subtle"
                color="text-disabled"
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
              >{t`Done`}</ResponsiveButton>
            )}
          </Group>
        </Group>
      </Stack>

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
    </Stack>
  );
};

export const TableSection = memo(TableSectionBase);
