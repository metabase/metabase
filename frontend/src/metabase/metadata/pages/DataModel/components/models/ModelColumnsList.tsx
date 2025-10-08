import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/common/components/EmptyState";
import { useMetadataToasts } from "metabase/metadata/hooks";
import S from "metabase/metadata/pages/DataModel/components/TableSection/TableSection.module.css";
import { getModelFieldMetadataUrl } from "metabase/metadata/pages/DataModel/components/models/utils";
import { Group, Stack, Text, rem } from "metabase/ui";
import type { Table, UpdateFieldRequest } from "metabase-types/api";

import { FieldItem } from "./FieldItem";
import type { ModelColumnUpdate } from "./types";

interface Props {
  activeFieldName?: string;
  getFieldHref: (fieldName: string) => string;
  table: Table;
  onChangeSettings: (update: ModelColumnUpdate) => Promise<{ error?: string }>;
}

export const ModelColumnsList = ({
  activeFieldName,
  getFieldHref,
  table,
  onChangeSettings,
}: Props) => {
  const fields = useMemo(() => {
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const name = field.name;
        const parentName = field.nfc_path?.[0] ?? "";
        const parent = fieldsByName[parentName];

        return (
          <FieldItem
            key={name}
            active={name === activeFieldName}
            field={field}
            parent={parent}
            href={getFieldHref(name)}
            onChangeSettings={onChangeSettings}
          />
        );
      })}
    </Stack>
  );
};

interface ModelColumnsSectionProps {
  modelId: number;
  fieldName: string | null | undefined;
  table: Table;
  onFieldChange: (update: UpdateFieldRequest) => Promise<{ error?: string }>;
}

export function ModelColumnsSection({
  modelId,
  fieldName,
  table,
  onFieldChange,
}: ModelColumnsSectionProps) {
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
              onChangeSettings={onFieldChange}
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
