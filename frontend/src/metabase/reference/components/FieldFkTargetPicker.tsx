import { useListDatabaseIdFieldsQuery } from "metabase/api";
import { FkTargetPicker } from "metabase/metadata/components";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field, FieldId } from "metabase-types/api";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  value: FieldId | null;
  onChange: (value: FieldId | null) => void;
}

export const FieldFkTargetPicker = ({
  databaseId,
  field,
  value,
  onChange,
}: Props) => {
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });

  return (
    <FkTargetPicker
      comboboxProps={{
        width: 300,
      }}
      field={field}
      fw="bold"
      idFields={idFields}
      value={value}
      onChange={onChange}
    />
  );
};
