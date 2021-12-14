import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Select from "metabase/components/Select";

import Field from "metabase-lib/lib/metadata/Field";

type FieldObject = {
  id: number;
  display_name: string;
  fk_target_field_id?: number;
  table: {
    display_name: string;
  };
};

type Props = {
  field: FieldObject;
  IDFields: Field[];
  onChange: () => void;
};

function getOptionValue(option: FieldObject) {
  return option.id;
}

function getOptionIcon(option: FieldObject) {
  return null;
}

function getFieldName(field: Field) {
  return field.displayName({ includeTable: true });
}

const SEARCH_PROPERTIES = [
  "display_name",
  "table.display_name",
  "table.schema_name",
];

function FKTargetPicker({ field, IDFields, onChange }: Props) {
  const options = useMemo(
    () => _.sortBy(IDFields, field => getFieldName(field)),
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
      optionNameFn={getFieldName}
      optionIconFn={getOptionIcon}
    />
  );
}

export default FKTargetPicker;
