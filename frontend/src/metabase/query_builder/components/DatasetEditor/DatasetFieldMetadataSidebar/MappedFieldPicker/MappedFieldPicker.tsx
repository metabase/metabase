import cx from "classnames";
import { useField } from "formik";
import { useCallback, useRef, useMemo } from "react";
import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { Text } from "metabase/ui";
import Field from "metabase-lib/v1/metadata/Field";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId } from "metabase-types/api";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type MappedFieldPickerProps = {
  name: string;
  databaseId: number | null;
  tabIndex?: number;
  label: string;
};

function MappedFieldPicker({
  databaseId = null,
  name,
  tabIndex,
  label,
}: MappedFieldPickerProps) {
  const [{ value: selectedFieldId = null }, _, { setValue }] = useField(name);

  const { data: field = null } = useGetFieldQuery(
    {
      id: selectedFieldId,
    },
    { skip: selectedFieldId === null },
  );

  const fieldObject = useMemo(() => {
    return field && selectedFieldId ? new Field(field) : null;
  }, [field, selectedFieldId]);

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
    <>
      <Text fw="bold" color="text-medium">
        {label}
      </Text>
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
    </>
  );
}
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MappedFieldPicker;
