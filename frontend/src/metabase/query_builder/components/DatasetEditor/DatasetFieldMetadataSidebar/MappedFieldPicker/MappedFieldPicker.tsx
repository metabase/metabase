import cx from "classnames";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetFieldQuery,
  useGetTableMetadataQuery,
} from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type MappedFieldPickerProps = {
  field: {
    value: number | null;
    onChange: (fieldId: number | null) => void;
  };
  formField: {
    databaseId: number;
  };
  tabIndex?: number;
};

function MappedFieldPicker({
  field: { value: selectedFieldId = null, onChange },
  formField,
  tabIndex,
}: MappedFieldPickerProps) {
  const { databaseId = null } = formField;
  const { currentData: field, ...fieldQuery } = useGetFieldQuery(
    selectedFieldId ? { id: selectedFieldId } : skipToken,
  );
  const { currentData: table, ...tableQuery } = useGetTableMetadataQuery(
    field ? { id: field.table_id } : skipToken,
  );

  const selectButtonRef = useRef<HTMLButtonElement>();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onFieldChange = useCallback(
    fieldId => {
      onChange(fieldId);
      selectButtonRef.current?.focus();
    },
    [onChange],
  );

  const renderTriggerElement = useCallback(() => {
    const label =
      field && table
        ? `${field.display_name} → ${table?.display_name}`
        : t`None`;
    return (
      <StyledSelectButton
        hasValue={!!field}
        tabIndex={tabIndex}
        ref={selectButtonRef as any}
        onClear={() => onChange(null)}
      >
        {label}
      </StyledSelectButton>
    );
  }, [field, table, onChange, tabIndex]);

  if (
    fieldQuery.isLoading ||
    tableQuery.isLoading ||
    fieldQuery.error ||
    tableQuery.error
  ) {
    return (
      <LoadingAndErrorWrapper
        loading={fieldQuery.isLoading || tableQuery.isLoading}
        error={fieldQuery.error ?? tableQuery.error}
      />
    );
  }

  // DataSelector doesn't handle selectedTableId change prop nicely.
  // During the initial load, field might have `table_id` set to `card__$ID` (retrieved from metadata)
  // But at some point, we fetch  the formField object by ID to get the real table ID and pass it to the selector
  // Until it's fetched, we need to pass `null` as `selectedTableId` to avoid invalid selector state
  // This should be removed once DataSelector handles prop changes better
  const selectedTableId =
    !field || isVirtualCardId(field.table_id) ? null : field.table_id;

  return (
    <SchemaTableAndFieldDataSelector
      className={cx(
        CS.flex,
        CS.flexFull,
        CS.flexBasisNone,
        CS.justifyCenter,
        CS.alignCenter,
      )}
      selectedDatabaseId={databaseId}
      selectedTableId={selectedTableId}
      selectedSchemaId={table && generateSchemaId(table.db_id, table.schema)}
      selectedFieldId={selectedFieldId}
      getTriggerElementContent={renderTriggerElement}
      hasTriggerExpandControl={false}
      triggerTabIndex={tabIndex}
      setFieldFn={onFieldChange}
      onClose={focusSelectButton}
    />
  );
}
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MappedFieldPicker;
