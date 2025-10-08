import { partition } from "underscore";

import type { EngineField, FieldGroupConfig } from "metabase-types/api";

export class GroupedFields {
  constructor(
    public fields: EngineField[],
    public fieldGroupConfig: FieldGroupConfig,
  ) {}
}

export function groupFields({
  fields,
  fieldGroupConfig,
}: {
  fields: Array<EngineField | GroupedFields>;
  fieldGroupConfig: FieldGroupConfig;
}): Array<EngineField | GroupedFields> {
  if (fields.length === 0) {
    return fields;
  }

  const fieldIndexes = fields.reduce<number[]>((acc, field, index) => {
    if (
      field instanceof GroupedFields ||
      fieldGroupConfig.id !== field["group-id"]
    ) {
      return acc;
    }
    return [...acc, index];
  }, []);

  // If we haven't found all the fields, return the original fields
  if (fieldIndexes.length === 0) {
    return fields;
  }

  const [fieldsToGroup, filteredFields] = partition(fields, (_field, index) => {
    return fieldIndexes.includes(index);
  });

  const groupedFields = new GroupedFields(
    fieldsToGroup as EngineField[],
    fieldGroupConfig,
  );

  // Insert the group field at the position of the first field from the group
  return filteredFields.toSpliced(fieldIndexes[0], 0, groupedFields);
}
