import { useListDatabaseIdFieldsQuery } from "metabase/api";
import { FkTargetPicker } from "metabase/metadata/components";
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
