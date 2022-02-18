import React from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import Select from "metabase/core/components/Select";
import * as MetabaseCore from "metabase/lib/core";
import { Field } from "metabase-types/types/Field";

interface FieldVisibilityPickerProps {
  field: Field;
  className?: string;
  disabled?: boolean;
  updateField: (field: Partial<Field>) => void;
}

const FieldVisibilityPicker = ({
  field,
  className,
  disabled,
  updateField,
}: FieldVisibilityPickerProps) => {
  const handleChangeVisibility = ({
    target: { value: visibility_type },
  }: any) => {
    updateField({ visibility_type });
  };

  return (
    <Select
      disabled={disabled}
      className={cx("TableEditor-field-visibility", className)}
      value={field.visibility_type}
      onChange={handleChangeVisibility}
      options={MetabaseCore.field_visibility_types}
      optionValueFn={(o: any) => o.id}
      placeholder={t`Select a field visibility`}
    />
  );
};

export default FieldVisibilityPicker;
