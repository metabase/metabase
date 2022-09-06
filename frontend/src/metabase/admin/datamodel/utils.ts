import { Field } from "metabase-types/api";

export const getFieldRawName = (field: Field) =>
  field.nfc_path ? field.nfc_path.join(".") : field.name;
