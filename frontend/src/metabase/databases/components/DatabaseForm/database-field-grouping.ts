import type { EngineField } from "metabase-types/api";

export class VisibleIfRule {
  constructor(public visibleIfConditions: Record<string, boolean>) {}
}

export class FieldRegexRule {
  constructor(public regex: RegExp) {}
}

export class GroupField {
  constructor(
    public fields: EngineField[],
    public className: string,
    public key: string,
  ) {}
}

export function groupFieldsByRules(
  fields: Array<EngineField | GroupField>,
  {
    rules,
    className,
    key,
  }: {
    rules?: Array<VisibleIfRule | FieldRegexRule>;
    className: string;
    key: string;
  },
): Array<EngineField | GroupField> {
  if (fields.length === 0) {
    return fields;
  }

  // Indexes of the fields to combine into one group field
  const indexes = fields
    .filter((field) => {
      if (field instanceof GroupField) {
        return false;
      }

      const result = rules?.some((rule) => {
        if (rule instanceof FieldRegexRule) {
          return rule.regex.test(field.name);
        }

        if (rule instanceof VisibleIfRule) {
          return Object.entries(rule.visibleIfConditions).every(
            ([key, value]) => field?.["visible-if"]?.[key] === value,
          );
        }

        return false;
      });

      return result;
    })
    .map((field) => (field ? fields.indexOf(field) : -1))
    .filter((index) => index !== -1);

  // // If we haven't found all the fields, return the original fields
  if (indexes.length === 0) {
    return fields;
  }

  // Combine the fields into a group field
  const combinedField = new GroupField(
    indexes.map((index) => fields[index] as EngineField),
    className,
    key,
  );

  // Remove the fields that were combined into a group field
  const filteredFields: Array<EngineField | GroupField> = fields.filter(
    (_field, index) => !indexes.includes(index),
  );

  // Insert the group field at the position of the first field from the group
  return [...filteredFields].toSpliced(indexes[0], 0, combinedField);
}
