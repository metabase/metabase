import { useField } from "formik";
import type { KeyboardEventHandler } from "react";
import { t } from "ttag";

import { SemanticTypePicker } from "metabase/metadata/components";
import type { Field } from "metabase-types/api";

interface Props {
  className?: string;
  field: Field;
  tabIndex: number | undefined;
  onChange: (value: string | null) => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}

export const DatasetFieldMetadataSemanticTypePicker = ({
  className,
  field,
  tabIndex,
  onChange,
  onKeyDown,
}: Props) => {
  const [formField, _meta, { setValue }] = useField("semantic_type");

  const handleChange = (value: string | null) => {
    setValue(value);
    onChange(value);
  };

  return (
    <SemanticTypePicker
      className={className}
      field={field}
      label={t`Column type`}
      tabIndex={tabIndex}
      value={formField.value}
      onChange={handleChange}
      onKeyDown={onKeyDown}
    />
  );
};
