import { useField } from "formik";

import { useListDatabaseIdFieldsQuery } from "metabase/api";
import { FkTargetPicker } from "metabase/metadata/components";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field, FieldId } from "metabase-types/api";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  onChange: (value: FieldId | null) => void;
}

export const DatasetFieldMetadataFkTargetPicker = ({
  databaseId,
  field,
  onChange,
}: Props) => {
  const [formField, _meta, { setValue }] = useField("fk_target_field_id");
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });

  const handleChange = (value: FieldId | null) => {
    setValue(value);
    onChange(value);
  };

  return (
    <FkTargetPicker
      comboboxProps={{
        width: 300,
      }}
      field={field}
      fw="bold"
      idFields={idFields}
      value={formField.value}
      onChange={handleChange}
    />
  );
};
