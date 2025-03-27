import { useField } from "formik";
import { useEffect } from "react";

import Databases from "metabase/entities/databases";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { FkTargetPicker } from "metabase/metadata/components";
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
  const dispatch = useDispatch();
  const [formField, _meta, { setValue }] = useField("fk_target_field_id");
  const idFields = useSelector((state) => {
    return Databases.selectors.getIdFields(state, { databaseId });
  });

  const handleChange = (value: FieldId | null) => {
    setValue(value);
    onChange(value);
  };

  useEffect(() => {
    dispatch(Databases.objectActions.fetchIdFields({ id: databaseId }));
  }, [databaseId, dispatch]);

  return (
    <FkTargetPicker
      field={field}
      idFields={idFields}
      value={formField.value}
      onChange={handleChange}
    />
  );
};
