import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import {
  useGetTableQueryMetadataQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { ModelColumnsList } from "metabase/bench/components/models/ModelColumnsList";
import type { ModelColumnUpdate } from "metabase/bench/components/models/types";
import { getModelFieldMetadataUrl } from "metabase/bench/components/models/utils";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { FieldSection } from "metabase/metadata/pages/DataModel/components";
import S from "metabase/metadata/pages/DataModel/components/TableSection/TableSection.module.css";
import {
  COLUMN_CONFIG,
  EMPTY_STATE_MIN_WIDTH,
} from "metabase/metadata/pages/DataModel/constants";
import { getTableMetadataQuery } from "metabase/metadata/pages/DataModel/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Group, Loader, Stack, Text, rem } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

export const ModelMetadata = ({
  params,
}: {
  location: Location;
  params: { modelId: string; fieldName?: string };
}) => {
  const modelId = Urls.extractEntityId(params.modelId);
  const fieldName = params.fieldName;
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure();

  const [
    isFieldValuesModalOpen,
    { close: closeFieldValuesModal, open: openFieldValuesModal },
  ] = useDisclosure();
  const isEmptyStateShown = modelId == null || fieldName == null;

  const {
    data: model,
    error,
    isLoading: isLoadingModel,
  } = useGetTableQueryMetadataQuery(
    getTableMetadataQuery(getQuestionVirtualTableId(modelId)),
  );
  const fieldsByName = useMemo(() => {
    return _.indexBy(model?.fields ?? [], (field) => field.name);
  }, [model]);
  const field = fieldsByName[fieldName];
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];

  const isLoading = isLoadingModel; // TODO: add "modelIndexes" loading?

  return (
    <Flex bg="accent-gray-light" data-testid="data-model" h="100%">
      <Stack
        className={S.column} // TODO: add styles
        flex={COLUMN_CONFIG.table.flex}
        h="100%"
        justify={error ? "center" : undefined}
        maw={COLUMN_CONFIG.table.max}
        miw={COLUMN_CONFIG.table.min}
      >
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          {modelId && model && (
            <TableSection
              /**
               * Make sure internal component state is reset when changing tables.
               * This is to avoid state mix-up with optimistic updates.
               */
              key={model.id}
              modelId={modelId}
              params={params}
              table={model}
            />
          )}
        </LoadingAndErrorWrapper>
      </Stack>

      {!isEmptyStateShown && (
        <Stack
          className={S.column}
          flex={COLUMN_CONFIG.field.flex}
          h="100%"
          justify={
            (!isLoading && !error && !field) || error ? "center" : undefined
          }
          maw={COLUMN_CONFIG.field.max}
          miw={COLUMN_CONFIG.field.min}
        >
          <LoadingAndErrorWrapper error={error} loading={isLoading}>
            {field && model && (
              <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                <FieldSection
                  field={field}
                  /**
                   * Make sure internal component state is reset when changing fields.
                   * This is to avoid state mix-up with optimistic updates.
                   */
                  key={getRawTableFieldId(field)}
                  parent={parentField}
                  table={model}
                  onFieldValuesClick={openFieldValuesModal}
                  onPreviewClick={togglePreview}
                />
              </Box>
            )}
          </LoadingAndErrorWrapper>

          {!isLoading && !error && !field && (
            <LoadingAndErrorWrapper error={t`Not found.`} />
          )}
        </Stack>
      )}

      {isEmptyStateShown && (
        <Flex
          align="center"
          flex="1"
          justify="center"
          miw={rem(EMPTY_STATE_MIN_WIDTH)}
        >
          <Box maw={rem(320)} p="xl">
            <EmptyState
              illustrationElement={<img src={EmptyDashboardBot} />}
              title={t`Edit model metadata`}
              message={t`Select a field to edit its name, description, formatting, and more.`}
            />
          </Box>
        </Flex>
      )}
    </Flex>
  );
};

interface TableSectionProps {
  modelId: number;
  fieldName: string | null | undefined;
  table: Table;
}

function TableSection({ modelId, fieldName, table }: TableSectionProps) {
  const [updateCard] = useUpdateCardMutation();

  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  // const [isSorting, setIsSorting] = useState(false);
  const isSorting = false;

  const hasFields = Boolean(table.fields && table.fields.length > 0);

  // const {
  //   buttonsContainerRef,
  //   showButtonLabel,
  //   setDoneButtonWidth,
  //   setSortingButtonWidth,
  // } = useResponsiveButtons({
  //   hasFields,
  //   isSorting,
  //   isUpdatingSorting: false, // isUpdatingSorting
  // });

  const handleColumnMetadataChange = async (update: ModelColumnUpdate) => {
    const metadata = table.fields;
    const newMetadata = metadata?.map((column) => {
      return update.name === column.name ? { ...column, ...update } : column;
    });

    await updateCard({
      id: modelId,
      result_metadata: newMetadata,
    });
  };

  // const handleFieldOrderTypeChange = async (fieldOrder: TableFieldOrder) => {
  //   const { error } = await updateTableSorting({
  //     id: table.id,
  //     field_order: fieldOrder,
  //   });
  //
  //   if (error) {
  //     sendErrorToast(t`Failed to update field order`);
  //   } else {
  //     sendSuccessToast(t`Field order updated`, async () => {
  //       const { error } = await updateTable({
  //         id: table.id,
  //         field_order: table.field_order,
  //       });
  //       sendUndoToast(error);
  //     });
  //   }
  // };
  //
  // const handleCustomFieldOrderChange = async (fieldOrder: FieldId[]) => {
  //   const { error } = await updateTableFieldsOrder({
  //     id: table.id,
  //     field_order: fieldOrder,
  //   });
  //
  //   if (error) {
  //     sendErrorToast(t`Failed to update field order`);
  //   } else {
  //     sendSuccessToast(t`Field order updated`, async () => {
  //       const { error: fieldsOrderError } = await updateTableFieldsOrder({
  //         id: table.id,
  //         field_order: table.fields?.map(getRawTableFieldId) ?? [],
  //       });
  //
  //       if (table.field_order !== "custom") {
  //         const { error: tableError } = await updateTable({
  //           id: table.id,
  //           field_order: table.field_order,
  //         });
  //         sendUndoToast(fieldsOrderError ?? tableError);
  //       } else {
  //         sendUndoToast(fieldsOrderError);
  //       }
  //     });
  //   }
  // };

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
          <Text flex="0 0 auto" fw="bold">{t`Columns`}</Text>

          <Group
            flex="1"
            gap="md"
            justify="flex-end"
            miw={0}
            // ref={buttonsContainerRef}
            wrap="nowrap"
          >
            {/* keep these conditions in sync with getRequiredWidth in useResponsiveButtons */}

            {/*TODO: add columns sorting handling*/}
            {/*{isUpdatingSorting && (*/}
            {/*  <Loader data-testid="loading-indicator" size="xs" />*/}
            {/*)}*/}

            {/*{!isSorting && hasFields && (*/}
            {/*  <ResponsiveButton*/}
            {/*    icon="sort_arrows"*/}
            {/*    showLabel={showButtonLabel}*/}
            {/*    onClick={() => setIsSorting(true)}*/}
            {/*    onRequestWidth={setSortingButtonWidth}*/}
            {/*  >{t`Sorting`}</ResponsiveButton>*/}
            {/*)}*/}

            {/*{isSorting && (*/}
            {/*  <FieldOrderPicker*/}
            {/*    value={table.field_order}*/}
            {/*    onChange={handleFieldOrderTypeChange}*/}
            {/*  />*/}
            {/*)}*/}

            {/*{isSorting && (*/}
            {/*  <ResponsiveButton*/}
            {/*    icon="check"*/}
            {/*    showLabel={showButtonLabel}*/}
            {/*    showIconWithLabel={false}*/}
            {/*    onClick={() => setIsSorting(false)}*/}
            {/*    onRequestWidth={setDoneButtonWidth}*/}
            {/*  >{t`Done`}</ResponsiveButton>*/}
            {/*)}*/}
          </Group>
        </Group>
      </Stack>

      <Stack gap="lg" px="xl">
        <Stack gap={12}>
          {!hasFields && <EmptyState message={t`This model has no columns`} />}

          {/*TODO: add columns sorting handling*/}
          {/*{isSorting && hasFields && (*/}
          {/*  <SortableFieldList*/}
          {/*    activeFieldId={fieldId}*/}
          {/*    table={table}*/}
          {/*    onChange={handleCustomFieldOrderChange}*/}
          {/*  />*/}
          {/*)}*/}

          {!isSorting && hasFields && (
            <ModelColumnsList
              activeFieldName={fieldName}
              getFieldHref={(fieldName) =>
                getModelFieldMetadataUrl({ modelId, fieldName })
              }
              table={table}
              onChangeSettings={handleColumnMetadataChange}
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
