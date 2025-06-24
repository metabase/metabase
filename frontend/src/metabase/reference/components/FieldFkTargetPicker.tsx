import { useEffect } from "react";

import Databases from "metabase/entities/databases";
import { useDispatch, useSelector } from "metabase/lib/redux";
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
  const dispatch = useDispatch();
  const idFields = useSelector((state) => {
    return Databases.selectors.getIdFields(state, { databaseId });
  });

  useEffect(() => {
    dispatch(Databases.objectActions.fetchIdFields({ id: databaseId }));
  }, [databaseId, dispatch]);

  return (
    <FkTargetPicker
      field={field}
      idFields={idFields}
      value={value}
      onChange={onChange}
    />
  );
};
