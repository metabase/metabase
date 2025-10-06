import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useState } from "react";
import { t } from "ttag";

import {
  useGetTableQueryMetadataQuery,
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import {
  FieldOrderPicker,
  SortableFieldList,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ResponsiveButton } from "metabase/metadata/pages/DataModel/components";
import { FieldList } from "metabase/metadata/pages/DataModel/components/TableSection/FieldList";
import S from "metabase/metadata/pages/DataModel/components/TableSection/TableSection.module.css";
import { useResponsiveButtons } from "metabase/metadata/pages/DataModel/components/TableSection/hooks";
import { COLUMN_CONFIG } from "metabase/metadata/pages/DataModel/constants";
import type { RouteParams } from "metabase/metadata/pages/DataModel/types";
import {
  getTableMetadataQuery,
  getUrl,
} from "metabase/metadata/pages/DataModel/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Group, Loader, Stack, Text } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

export const ModelMetadata = ({
  params,
}: {
  location: Location;
  params: { modelId: string; fieldId?: string };
}) => {
  const modelId = Urls.extractEntityId(params.modelId);
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();

  const {
    data: model,
    error,
    isLoading: isLoadingModel,
  } = useGetTableQueryMetadataQuery(
    getTableMetadataQuery(getQuestionVirtualTableId(modelId)),
  );

  const isLoading = isLoadingModel; // TODO: add "modelIndexes" loading?

  return (
    <Stack
      className={S.column}
      flex={COLUMN_CONFIG.table.flex}
      h="100%"
      justify={error ? "center" : undefined}
      maw={COLUMN_CONFIG.table.max}
      miw={COLUMN_CONFIG.table.min}
    >
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {model && (
          <TableSection
            /**
             * Make sure internal component state is reset when changing tables.
             * This is to avoid state mix-up with optimistic updates.
             */
            key={model.id}
            params={params}
            table={model}
            onSyncOptionsClick={openSyncModal}
          />
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
};

interface TableSectionProps {
  table: Table;
  params: RouteParams;
  onSyncOptionsClick: () => void;
}

function TableSection({
  table,
  params,
  onSyncOptionsClick,
}: TableSectionProps) {
  const fieldId = Urls.extractEntityId(params.fieldId);

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
              getFieldHref={(fieldId) => getUrl({ ...params, fieldId })}
              table={table}
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
