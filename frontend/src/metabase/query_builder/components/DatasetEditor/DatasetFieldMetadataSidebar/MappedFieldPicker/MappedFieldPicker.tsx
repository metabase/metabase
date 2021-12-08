import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { FieldSelector } from "metabase/query_builder/components/DataSelector";

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

function MappedFieldPickerTrigger({ selectedField }: CollapsedPickerProps) {
  const label = selectedField
    ? `${selectedField.table.display_name} → ${selectedField.display_name}`
    : t`None`;
  return (
    <StyledSelectButton hasValue={!!selectedField}>{label}</StyledSelectButton>
  );
}

type MappedFieldPickerProps = {
  dataset: {
    databaseId: () => number;
  };
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
