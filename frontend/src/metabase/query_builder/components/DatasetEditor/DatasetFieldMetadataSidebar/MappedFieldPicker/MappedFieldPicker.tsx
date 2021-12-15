import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { FieldSelector } from "metabase/query_builder/components/DataSelector";

import Question from "metabase-lib/lib/Question";
import Field from "metabase-lib/lib/metadata/Field";

import { StyledSelectButton } from "./MappedFieldPicker.styled";

type FieldObject = {
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
    ? selectedField.displayName({ includeTable: true })
    : t`None`;
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
