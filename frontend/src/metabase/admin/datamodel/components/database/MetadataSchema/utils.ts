import _ from "underscore";
import { Field } from "metabase-types/api";

export const getFieldsTable = (fields: Field[]) => {
  const [nonNested, nested] = _.partition(
    fields,
    field => field.nfc_path == null,
  );

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const nestedByParent = _.groupBy(nested, field => field.nfc_path![0]);

  return nonNested.map(field => ({
    ...field,
    nested: nestedByParent[field.name],
  }));
};
