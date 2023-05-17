import React, { useCallback, useRef } from "react";
import { t } from "ttag";

import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";

import Fields from "metabase/entities/fields";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import Field from "metabase-lib/metadata/Field";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type MappedFieldPickerOwnProps = {
  field: {
    value: number | null;
    onChange: (fieldId: number | null) => void;
  };
  formField: {
    databaseId: number;
  };
  fieldObject?: Field;
  tabIndex?: number;
};

type MappedFieldPickerStateProps = {
  fieldObject?: Field;
};

type MappedFieldPickerProps = MappedFieldPickerOwnProps &
  MappedFieldPickerStateProps;

const query = {
  id: (state: unknown, { field }: MappedFieldPickerOwnProps) =>
    field.value || null,

  // When using Field object loader, it passes the field object as a `field` prop
  // and overwrites form's `field` prop. Entity alias makes it pass the `fieldObject` prop instead
  entityAlias: "fieldObject",

  loadingAndErrorWrapper: false,
};

function MappedFieldPicker({
  field,
  formField,
  fieldObject,
  tabIndex,
}: MappedFieldPickerProps) {
  const { value: selectedFieldId = null, onChange } = field;
  const { databaseId = null } = formField;

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
    const label = fieldObject
      ? fieldObject.displayName({ includeTable: true })
      : t`None`;
    return (
      <StyledSelectButton
        hasValue={!!fieldObject}
        tabIndex={tabIndex}
        ref={selectButtonRef as any}
        onClear={() => onChange(null)}
      >
        {label}
      </StyledSelectButton>
    );
  }, [fieldObject, onChange, tabIndex]);

  // DataSelector doesn't handle selectedTableId change prop nicely.
  // During the initial load, fieldObject might have `table_id` set to `card__$ID` (retrieved from metadata)
  // But at some point, we fetch  the field object by ID to get the real table ID and pass it to the selector
  // Until it's fetched, we need to pass `null` as `selectedTableId` to avoid invalid selector state
  // This should be removed once DataSelector handles prop changes better
  const selectedTableId =
    !fieldObject || isVirtualCardId(fieldObject.table?.id)
      ? null
      : fieldObject?.table?.id;

  return (
    <SchemaTableAndFieldDataSelector
      className="flex flex-full justify-center align-center"
      selectedDatabaseId={databaseId}
      selectedTableId={selectedTableId}
      selectedSchemaId={fieldObject?.table?.schema?.id}
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
export default Fields.load(query)(MappedFieldPicker);
