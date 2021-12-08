import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Select from "metabase/components/Select";

type Field = {
  id: number;
  display_name: string;
  fk_target_field_id?: number;
  table: {
    display_name: string;
  };
};

type Props = {
  field: Field;
  IDFields: Field[];
  onChange: () => void;
};

function getOptionValue(option: Field) {
  return option.id;
}

function getOptionIcon(option: Field) {
  return null;
}

function formatFieldLabel(field: Field) {
  const tableName = field.table.display_name;
  return `${tableName} → ${field.display_name}`;
}

const SEARCH_PROPERTIES = [
  "display_name",
  "table.display_name",
  "table.schema_name",
];

function FKTargetPicker({ field, IDFields, onChange }: Props) {
  const options = useMemo(
    () => _.sortBy(IDFields, field => formatFieldLabel(field)),
    [IDFields],
  );

  return (
    <Select
      placeholder={t`Select a target`}
      value={field.fk_target_field_id}
      options={options}
      onChange={onChange}
      searchable
      searchProp={SEARCH_PROPERTIES}
      optionValueFn={getOptionValue}
      optionNameFn={formatFieldLabel}
      optionIconFn={getOptionIcon}
    />
  );
}

export default FKTargetPicker;
