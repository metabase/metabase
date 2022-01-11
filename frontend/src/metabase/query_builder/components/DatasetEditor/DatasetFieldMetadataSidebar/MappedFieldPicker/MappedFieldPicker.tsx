import React, { useCallback, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";

import Field from "metabase-lib/lib/metadata/Field";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type CollapsedPickerProps = {
  selectedField?: Field;
  isTriggeredComponentOpen: boolean;
  open: () => void;
  close: () => void;
};

type MappedFieldPickerProps = {
  field: {
    value: number | null;
    onChange: (fieldId: number) => void;
  };
  formField: {
    databaseId: number;
  };
  tabIndex?: number;
};

function MappedFieldPicker({
  field,
  formField,
  tabIndex,
}: MappedFieldPickerProps) {
  const { value: selectedFieldId = null, onChange } = field;
  const { databaseId = null } = formField;

  const selectButtonRef = useRef<HTMLDivElement>();

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

  const renderTriggerElement = useCallback(
    ({ selectedField, open }: CollapsedPickerProps) => {
      const label = selectedField
        ? selectedField.displayName({ includeTable: true })
        : t`None`;
      return (
        <StyledSelectButton
          hasValue={!!selectedField}
          tabIndex={tabIndex}
          onKeyUp={e => {
            if (e.key === "Enter") {
              open();
            }
          }}
          ref={selectButtonRef}
        >
          {label}
        </StyledSelectButton>
      );
    },
    [tabIndex],
  );

  return (
    <SchemaTableAndFieldDataSelector
      className="flex flex-full justify-center align-center"
      selectedDatabaseId={databaseId}
      selectedFieldId={selectedFieldId}
      getTriggerElementContent={renderTriggerElement}
      hasTriggerExpandControl={false}
      triggerTabIndex={tabIndex}
      setFieldFn={onFieldChange}
      onClose={focusSelectButton}
    />
  );
}

export default MappedFieldPicker;
