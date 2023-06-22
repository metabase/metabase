import { useCallback } from "react";
import cx from "classnames";
import { t } from "ttag";
import * as MetabaseCore from "metabase/lib/core";
import Select, {
  SelectChangeEvent,
} from "metabase/core/components/Select/Select";
import { FieldVisibilityType } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";

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
      className={cx("TableEditor-field-visibility", className)}
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
