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

  // Indexes of the fields to combine into one group field
  const fieldIndexes = fields
    .filter((field) => {
      if (field instanceof GroupedFields) {
        return false;
      }

      return fieldGroupConfig.id === field["group-id"];
    })
    .map((field) => (field ? fields.indexOf(field) : -1))
    .filter((index) => index !== -1);

  // // If we haven't found all the fields, return the original fields
  if (fieldIndexes.length === 0) {
    return fields;
  }

  // Combine the fields into a group field
  const groupedFields = new GroupedFields(
    fieldIndexes.map((index) => fields[index] as EngineField),
    fieldGroupConfig,
  );

  // Remove the fields that were combined into a group field
  const filteredFields: Array<EngineField | GroupedFields> = fields.filter(
    (_field, index) => !fieldIndexes.includes(index),
  );

  // Insert the group field at the position of the first field from the group
  return [...filteredFields].toSpliced(fieldIndexes[0], 0, groupedFields);
}
