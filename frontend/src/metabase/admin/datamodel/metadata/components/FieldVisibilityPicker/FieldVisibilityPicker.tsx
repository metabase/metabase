import { useCallback } from "react";
import { t } from "ttag";

import type { SelectChangeEvent } from "metabase/core/components/Select/Select";
import Select from "metabase/core/components/Select/Select";
import * as MetabaseCore from "metabase/lib/core";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldVisibilityType } from "metabase-types/api";

interface FieldVisibilityPickerProps {
  className?: string;
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldVisibilityPicker = ({
  className,
  field,
  onUpdateField,
}: FieldVisibilityPickerProps) => {
  const handleChange = useCallback(
    (event: SelectChangeEvent<FieldVisibilityType>) => {
      onUpdateField(field, { visibility_type: event.target.value });
    },
    [field, onUpdateField],
  );

  return (
    <Select
      className={className}
      value={field.visibility_type}
      options={MetabaseCore.field_visibility_types}
      optionValueFn={getFieldId}
      placeholder={t`Select a field visibility`}
      onChange={handleChange}
    />
  );
};

const getFieldId = (field: Field) => {
  return field.id;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldVisibilityPicker;
