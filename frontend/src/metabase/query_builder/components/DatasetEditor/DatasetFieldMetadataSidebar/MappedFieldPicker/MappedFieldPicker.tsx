import cx from "classnames";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import Fields from "metabase/entities/fields";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import Field from "metabase-lib/v1/metadata/Field";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId } from "metabase-types/api";

import { StyledSelectButton } from "./MappedFieldPicker.styled";
import { useField } from "formik";
import { useGetFieldQuery } from "metabase/api";
import { entityForObject } from "metabase/lib/schema";

type MappedFieldPickerProps = {
  name: string;
  databaseId: number | null;
  tabIndex?: number;
};

function MappedFieldPicker({
  databaseId = null,
  name,
  tabIndex,
}: MappedFieldPickerProps) {
  // const { value: selectedFieldId = null, onChange } = field;
  // const { databaseId = null } = formField;

  const [
    { value: selectedFieldId = null },
    { error, touched },
    { setValue, setTouched },
  ] = useField(name);

  const { data: field = null, isLoading } = useGetFieldQuery({
    id: selectedFieldId,
  });

  const fieldObject = new Field(field);

  const selectButtonRef = useRef<HTMLButtonElement>();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onFieldChange = useCallback(
    (fieldId: FieldId) => {
      setValue(fieldId);
      selectButtonRef.current?.focus();
    },
    [setValue],
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
        onClear={() => setValue(null)}
      >
        {label}
      </StyledSelectButton>
    );
  }, [fieldObject, setValue, tabIndex]);

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
      className={cx(
        CS.flex,
        CS.flexFull,
        CS.flexBasisNone,
        CS.justifyCenter,
        CS.alignCenter,
      )}
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
export default MappedFieldPicker;
