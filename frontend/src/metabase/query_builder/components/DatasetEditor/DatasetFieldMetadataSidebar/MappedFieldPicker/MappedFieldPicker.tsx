import React, { useCallback, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";

import Question from "metabase-lib/lib/Question";
import Field from "metabase-lib/lib/metadata/Field";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type CollapsedPickerProps = {
  selectedField?: Field;
  isTriggeredComponentOpen: boolean;
  open: () => void;
  close: () => void;
};

type MappedFieldPickerProps = {
  dataset: Question;
  tabIndex?: number;
};

function MappedFieldPicker({ dataset, tabIndex }: MappedFieldPickerProps) {
  const selectButtonRef = useRef<HTMLDivElement>();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onFieldChange = useCallback(fieldId => {
    selectButtonRef.current?.focus();
  }, []);

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
      selectedDatabaseId={dataset.databaseId()}
      getTriggerElementContent={renderTriggerElement}
      hasTriggerExpandControl={false}
      triggerTabIndex={tabIndex}
      setFieldFn={onFieldChange}
      onClose={focusSelectButton}
    />
  );
}

export default MappedFieldPicker;
