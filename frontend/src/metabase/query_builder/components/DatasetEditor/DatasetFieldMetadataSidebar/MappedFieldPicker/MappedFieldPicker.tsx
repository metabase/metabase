import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { FieldSelector } from "metabase/query_builder/components/DataSelector";

import Question from "metabase-lib/lib/Question";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type Field = {
  display_name: string;
  table: {
    display_name: string;
  };
};

type CollapsedPickerProps = {
  selectedField?: Field;
};

function formatFieldLabel(field: Field) {
  const tableName = field.table.display_name;
  return `${tableName} → ${field.display_name}`;
}

function MappedFieldPickerTrigger({ selectedField }: CollapsedPickerProps) {
  const label = selectedField ? formatFieldLabel(selectedField) : t`None`;
  return (
    <StyledSelectButton hasValue={!!selectedField}>{label}</StyledSelectButton>
  );
}

type MappedFieldPickerProps = {
  dataset: Question;
};

function MappedFieldPicker({ dataset }: MappedFieldPickerProps) {
  return (
    <FieldSelector
      className="flex flex-full justify-center align-center"
      selectedDatabaseId={dataset.databaseId()}
      getTriggerElementContent={MappedFieldPickerTrigger}
      hasTriggerExpandControl={false}
    />
  );
}

export default MappedFieldPicker;
