import type { EngineField } from "metabase-types/api";

export class VisibleIfRule {
  constructor(public visibleIfConditions: Record<string, boolean>) {}

  check(field: EngineField): boolean {
    return Object.entries(this.visibleIfConditions).every(
      ([key, value]) => field?.["visible-if"]?.[key] === value,
    );
  }
}

export class FieldRegexRule {
  constructor(public regex: RegExp) {}

  check(field: EngineField): boolean {
    return this.regex.test(field.name);
  }
}

export class AllFieldsRule {
  constructor(public fieldNames: string[]) {}

  check(fields: Array<EngineField | GroupField>): boolean {
    return this.fieldNames.every((name) =>
      fields.some(
        (field) => !(field instanceof GroupField) && field.name === name,
      ),
    );
  }
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
    formRules,
    className,
    key,
  }: {
    rules?: Array<VisibleIfRule | FieldRegexRule>;
    formRules?: Array<AllFieldsRule>;
    className: string;
    key: string;
  },
): Array<EngineField | GroupField> {
  if (fields.length === 0) {
    return fields;
  }

  if (formRules) {
    if (!formRules.every((rule) => rule.check(fields))) {
      return fields;
    }
  }

  // Indexes of the fields to combine into one group field
  const indexes = fields
    .filter((field) => {
      if (field instanceof GroupField) {
        return false;
      }

      return rules?.some((rule) => rule.check(field));
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
