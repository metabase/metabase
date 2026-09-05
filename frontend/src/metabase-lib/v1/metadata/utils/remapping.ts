import {
  type FieldTypeInfo,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  FieldDimensionType,
  FieldId,
  FieldReference,
} from "metabase-types/api";

/**
 * The parts of a field that decide how its values are labelled and searched.
 *
 * The API field and the v1 `Field` wrapper both match it, and the type
 * parameter keeps a caller in its own world: give it API fields and it returns
 * an API field.
 */
export interface RemappableField<T> extends FieldTypeInfo {
  id: FieldId | FieldReference;
  dimensions?: {
    type: FieldDimensionType;
    human_readable_field_id?: FieldId;
    human_readable_field?: T;
  }[];
  target?: T;
  name_field?: T;
}

/**
 * Whether a field's values can be searched, such as in a filter or a parameter
 * widget.
 */
export function isSearchableField(field: FieldTypeInfo): boolean {
  return isString(field);
}

/**
 * The field that gives human-readable labels to this field's values.
 *
 * An internal remapping keeps the labels on the field itself, so the field is
 * its own remap target. An external remapping points at another field.
 */
export function getRemappedField<T extends RemappableField<T>>(
  field: T,
): T | null {
  return getInternalRemappedField(field) ?? getExternalRemappedField(field);
}

/**
 * The one field that every field in `fields` remaps to, or null when they
 * disagree.
 */
export function getSharedRemappedField<T extends RemappableField<T>>(
  fields: T[],
): T | null {
  const remappedFields = fields.map(getRemappedField);
  const remappedFieldIds = new Set(remappedFields.map((field) => field?.id));

  if (remappedFields[0] != null && remappedFieldIds.size === 1) {
    return remappedFields[0];
  }

  return null;
}

/**
 * Reads the remap target off the field itself. Both the API and the metadata
 * store nest it, either on a dimension or as a `name_field`, so this needs no
 * lookup by id.
 */
export function getExternalRemappedField<T extends RemappableField<T>>(
  field: T,
): T | null {
  const dimension = field.dimensions?.[0];

  if (dimension?.human_readable_field_id != null) {
    return dimension.human_readable_field ?? null;
  }

  // enables "implicit" remapping from type/PK to type/Name on the same table,
  // or type/FK to type/Name on the type/FK table;
  // used in FieldValuesWidget, but not table/object detail listings
  const maybePkField = field.target ?? field;
  return maybePkField.name_field ?? null;
}

/**
 * The field to search when a user types into a value picker. A field that
 * remaps to a searchable field is searched through that field, so the user
 * matches the label they see rather than the stored value.
 */
export function getSearchField<T extends RemappableField<T>>(
  field: T,
  disablePKRemapping = false,
): T | null {
  if (disablePKRemapping && isPK(field)) {
    return isSearchableField(field) ? field : null;
  }

  const remappedField = getExternalRemappedField(field);
  if (remappedField && isSearchableField(remappedField)) {
    return remappedField;
  }

  return isSearchableField(field) ? field : null;
}

function getInternalRemappedField<T extends RemappableField<T>>(
  field: T,
): T | null {
  return field.dimensions?.[0]?.type === "internal" ? field : null;
}
