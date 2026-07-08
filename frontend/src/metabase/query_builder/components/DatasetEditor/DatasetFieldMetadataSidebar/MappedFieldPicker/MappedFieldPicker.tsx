import cx from "classnames";
import { useField } from "formik";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import { SelectButton } from "metabase/common/components/SelectButton";
import CS from "metabase/css/core/index.css";
import { SchemaTableAndFieldDataSelector } from "metabase/querying/common/components/DataSelector";
import { Text } from "metabase/ui";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId } from "metabase-types/api";

import MappedFieldPickerS from "./MappedFieldPicker.module.css";

type MappedFieldPickerProps = {
  name: string;
  className?: string;
  databaseId: number | null;
  tabIndex?: number;
  label: string;
  onChange: (value: FieldId | null) => void;
};

export function MappedFieldPicker({
  className,
  databaseId = null,
  onChange,
  name,
  tabIndex,
  label,
}: MappedFieldPickerProps) {
  const [{ value: selectedFieldId = null }] = useField(name);

  const { data: field = null } = useGetFieldQuery(
    {
      id: selectedFieldId,
    },
    { skip: selectedFieldId === null },
  );

  const selectedField = field && selectedFieldId ? field : null;

  const selectButtonRef = useRef<HTMLButtonElement>();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onFieldChange = useCallback(
    (fieldId: FieldId) => {
      // use onChange instead of setValue because this value gets passed to a parent
      // component which adjusts the rest of the fields values.
      onChange(fieldId);
      selectButtonRef.current?.focus();
    },
    [onChange],
  );

  const renderTriggerElement = useCallback(() => {
    const label = selectedField?.display_name || t`None`;
    const tableName = selectedField?.table?.display_name;

    return (
      <SelectButton
        classNames={{
          root: cx(
            MappedFieldPickerS.StyledSelectButton,
            {
              [MappedFieldPickerS.hasValue]: selectedField,
            },
            className,
          ),
          icon: MappedFieldPickerS.StyledSelectIcon,
        }}
        hasValue={!!selectedField}
        tabIndex={tabIndex}
        ref={selectButtonRef as any}
        onClear={() => onChange(null)}
      >
        <span className={MappedFieldPickerS.StyledSelectButtonContent}>
          {`${tableName ? `${tableName} → ` : ""}${label}`}
        </span>
      </SelectButton>
    );
  }, [className, selectedField, onChange, tabIndex]);

  // DataSelector doesn't handle selectedTableId change prop nicely.
  // During the initial load, the field might have `table_id` set to `card__$ID` (retrieved from metadata)
  // But at some point, we fetch  the field object by ID to get the real table ID and pass it to the selector
  // Until it's fetched, we need to pass `null` as `selectedTableId` to avoid invalid selector state
  // This should be removed once DataSelector handles prop changes better
  const selectedTableId =
    !selectedField || isVirtualCardId(selectedField.table?.id)
      ? null
      : selectedField?.table?.id;

  return (
    <>
      <Text fw="bold" c="text-secondary">
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
        selectedSchemaId={selectedField?.table?.schema}
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
