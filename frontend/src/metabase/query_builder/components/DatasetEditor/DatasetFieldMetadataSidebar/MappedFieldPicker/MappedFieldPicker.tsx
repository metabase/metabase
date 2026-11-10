import cx from "classnames";
import { useField } from "formik";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import { SelectButton } from "metabase/common/components/SelectButton";
import CS from "metabase/css/core/index.css";
import { SchemaTableAndFieldDataSelector } from "metabase/querying/common/components/DataSelector";
import { Text } from "metabase/ui";
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

  const selectButtonRef = useRef<HTMLButtonElement>(undefined);

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
        // Unjustified type cast. FIXME
        ref={selectButtonRef as any}
        onClear={() => onChange(null)}
      >
        <span className={MappedFieldPickerS.StyledSelectButtonContent}>
          {`${tableName ? `${tableName} → ` : ""}${label}`}
        </span>
      </SelectButton>
    );
  }, [className, selectedField, onChange, tabIndex]);

  const selectedTableId = selectedField?.table?.id ?? null;

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
        setFieldFn={onFieldChange}
        onClose={focusSelectButton}
      />
    </>
  );
}
