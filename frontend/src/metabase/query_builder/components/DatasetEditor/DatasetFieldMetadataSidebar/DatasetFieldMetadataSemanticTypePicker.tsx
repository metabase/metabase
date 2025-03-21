import { useField } from "formik";

import { SemanticTypePicker } from "metabase/admin/datamodel/metadata/components/SemanticTypeAndTargetPicker";
import type { Field } from "metabase-types/api";

interface Props {
  className?: string;
  field: Field;
  onChange: (value: string | null) => void;
}

export const DatasetFieldMetadataSemanticTypePicker = ({
  className,
  field,
  onChange,
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
      value={formField.value}
      onChange={handleChange}
    />
  );
};
