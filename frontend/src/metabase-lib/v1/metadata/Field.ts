import _ from "underscore";

import { formatField, stripId } from "metabase/utils/formatting";
import {
  getFieldValues,
  getRemappings,
} from "metabase-lib/v1/queries/utils/field";
import {
  isAddress,
  isBoolean,
  isCoordinate,
  isCurrency,
  isDate,
  isDateWithoutTime,
  isDimension,
  isFK,
  isMetric,
  isNumber,
  isNumeric,
  isPK,
  isString,
  isStringLike,
  isSummable,
  isTime,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Field as ApiField,
  FieldFingerprint,
  FieldId,
  FieldReference,
  NormalizedField,
} from "metabase-types/api";

import type Metadata from "./Metadata";
import type Table from "./Table";
import { getIconForField, getUniqueFieldId } from "./utils/fields";

// This interface is intentionally empty: a class cannot `extends` a type alias,
// so merging an interface with the class is how instances inherit the API
// field's properties without re-declaring them. The class declares the rest.
//
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Field extends Omit<
  ApiField,
  "table" | "target" | "name_field" | "fingerprint"
> {}

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 *
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Field {
  // `table`/`target`/`name_field` are id references in the plain object and are
  // hydrated into instances by the metadata layer (`hydrateField`), so these
  // types describe a hydrated field. Properties are copied from the plain object
  // by the constructor, or set by hydration.
  table?: Table;
  target?: Field;
  name_field?: Field;
  fingerprint?: FieldFingerprint;
  _plainObject: NormalizedField;
  metadata?: Metadata;
  remapping?: Map<unknown, unknown>;
  source?: string;
  uniqueId?: string | number;

  constructor(object: NormalizedField) {
    this._plainObject = object;
    Object.assign(this, object);
  }

  getPlainObject(): NormalizedField {
    return this._plainObject;
  }

  getId() {
    if (Array.isArray(this.id)) {
      return this.id[1];
    }

    return this.id;
  }

  // `uniqueId` is set by our normalizr schema so it is not always available,
  // if the Field instance was instantiated outside of an entity
  getUniqueId() {
    if (this.uniqueId) {
      return this.uniqueId;
    }

    const uniqueId = getUniqueFieldId(this);
    this.uniqueId = uniqueId;

    return uniqueId;
  }

  parent() {
    return this.metadata ? this.metadata.field(this.parent_id) : null;
  }

  path() {
    const path: Field[] = [];
    let field: Field | null = this;

    do {
      path.unshift(field);
    } while ((field = field.parent()));

    return path;
  }

  displayName({
    includeSchema = false,
    includeTable = false,
    includePath = true,
  } = {}) {
    let displayName = "";

    // It is possible that the table doesn't exist or
    // that it does, but its `displayName` resolves to an empty string.
    if (includeTable && this.table?.displayName?.()) {
      displayName +=
        this.table.displayName({
          includeSchema,
        }) + " → ";
    }

    if (includePath) {
      displayName += this.path().map(formatField).join(": ");
    } else {
      displayName += formatField(this);
    }

    return displayName;
  }

  /**
   * The name of the object type this field points to.
   * Currently we try to guess this by stripping trailing `ID` from `display_name`, but ideally it would be configurable in metadata
   * See also `table.objectName()`
   */
  targetObjectName() {
    return stripId(this.displayName());
  }

  isDate() {
    return isDate(this);
  }

  isDateWithoutTime() {
    return isDateWithoutTime(this);
  }

  isTime() {
    return isTime(this);
  }

  isNumber() {
    return isNumber(this);
  }

  isNumeric() {
    return isNumeric(this);
  }

  isCurrency() {
    return isCurrency(this);
  }

  isBoolean() {
    return isBoolean(this);
  }

  isString() {
    return isString(this);
  }

  isStringLike() {
    return isStringLike(this);
  }

  isCoordinate() {
    return isCoordinate(this);
  }

  isAddress() {
    return isAddress(this);
  }

  isSummable() {
    return isSummable(this);
  }

  isMetric() {
    return isMetric(this);
  }

  /**
   * Tells if this column can be used in a breakout
   * Currently returns `true` for everything expect for aggregation columns
   */
  isDimension() {
    return isDimension(this);
  }

  isID() {
    return isPK(this) || isFK(this);
  }

  isPK() {
    return isPK(this);
  }

  isFK() {
    return isFK(this);
  }

  fieldValues() {
    return getFieldValues(this._plainObject);
  }

  hasFieldValues() {
    return !_.isEmpty(this.fieldValues());
  }

  remappedValues() {
    return getRemappings(this);
  }

  icon() {
    return getIconForField(this);
  }

  // REMAPPINGS

  static remappedField(fields: Field[]): Field | null {
    const remappedFields = fields.map((field) => field.remappedField());
    const remappedFieldIds = new Set(remappedFields.map((field) => field?.id));
    if (remappedFields[0] != null && remappedFieldIds.size === 1) {
      return remappedFields[0];
    }
    return null;
  }

  remappedField() {
    return this.remappedInternalField() ?? this.remappedExternalField();
  }

  remappedInternalField() {
    const dimensions = this.dimensions ?? [];
    if (dimensions.length > 0 && dimensions[0].type === "internal") {
      return this;
    }

    return null;
  }

  remappedExternalField() {
    const displayFieldId = this.dimensions?.[0]?.human_readable_field_id;

    if (displayFieldId != null) {
      return this.metadata?.field(displayFieldId) ?? null;
    }

    // enables "implicit" remapping from type/PK to type/Name on the same table,
    // or type/FK to type/Name on the type/FK table;
    // used in FieldValuesWidget, but not table/object detail listings
    const maybePkField = this.target ?? this;
    if (maybePkField.name_field) {
      return maybePkField.name_field;
    }

    return null;
  }

  remappedValue(value: unknown) {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    let key = value;
    if (this.isNumeric() && typeof key !== "number") {
      key = parseFloat(String(key));
    }

    return this.remapping && this.remapping.get(key);
  }

  hasRemappedValue(value: unknown) {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    let key = value;
    if (this.isNumeric() && typeof key !== "number") {
      key = parseFloat(String(key));
    }

    return this.remapping && this.remapping.has(key);
  }

  // Returns true if this field can be searched, e.g. in filter or parameter widgets
  isSearchable() {
    // TODO: ...?
    return this.isString();
  }

  searchField(disablePKRemapping = false): Field | null {
    if (disablePKRemapping && this.isPK()) {
      return this.isSearchable() ? this : null;
    }

    const remappedField = this.remappedExternalField();
    if (remappedField && remappedField.isSearchable()) {
      return remappedField;
    }

    return this.isSearchable() ? this : null;
  }

  clone(fieldMetadata?: Partial<NormalizedField>) {
    if (fieldMetadata instanceof Field) {
      throw new Error("`fieldMetadata` arg must be a plain object");
    }

    const newField = new Field(this.getPlainObject());
    Object.assign(newField, this, fieldMetadata);
    newField._plainObject = { ...this.getPlainObject(), ...fieldMetadata };

    return newField;
  }

  isVirtual() {
    return typeof this.id !== "number";
  }

  /* istanbul ignore next */
  _constructor(
    id: FieldId | FieldReference,
    name: string,
    display_name: string,
    description: string | null,
    table: Table,
    name_field: Field,
    metadata: Metadata,
  ) {
    this.id = id;
    this.name = name;
    this.display_name = display_name;
    this.description = description;
    this.table = table;
    this.name_field = name_field;
    this.metadata = metadata;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Field;
