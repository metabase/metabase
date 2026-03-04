// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";

import { formatField, stripId } from "metabase/lib/formatting";
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
  FieldFingerprint,
  FieldFormattingSettings,
  FieldId,
  FieldReference,
  FieldValuesType,
  FieldVisibilityType,
} from "metabase-types/api";

import Base from "./Base";
import type Metadata from "./Metadata";
import type Table from "./Table";
import { getIconForField, getUniqueFieldId } from "./utils/fields";

/**
 * @typedef { import("./Metadata").FieldValues } FieldValues
 */

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
// eslint-disable-next-line import/no-default-export
export default class Field extends Base {
  id: FieldId | FieldReference;
  name: string;
  display_name: string;
  description: string | null;
  semantic_type: string | null;
  fingerprint?: FieldFingerprint;
  base_type: string;
  effective_type?: string | null;
  table?: Table;
  table_id?: Table["id"];
  target?: Field;
  name_field?: Field;
  remapping?: unknown;
  has_field_values?: FieldValuesType;
  has_more_values?: boolean;
  values: any[];
  position: number;
  metadata?: Metadata;
  source?: string;
  nfc_path?: string[];
  json_unfolding: boolean | null;
  coercion_strategy: string | null;
  fk_target_field_id: FieldId | null;
  settings?: FieldFormattingSettings;
  visibility_type: FieldVisibilityType;

  getPlainObject(): IField {
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
    const path = [];
    let field = this;

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

  /**
   * @returns {FieldValues}
   */
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

  /**
   * Returns the remapped field, if any
   * @return {?Field}
   */
  remappedExternalField() {
    const displayFieldId = this.dimensions?.[0]?.human_readable_field_id;

    if (displayFieldId != null) {
      return this.metadata.field(displayFieldId);
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

  /**
   * Returns the human readable remapped value, if any
   * @returns {?string}
   */
  remappedValue(value) {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    if (this.isNumeric() && typeof value !== "number") {
      value = parseFloat(value);
    }

    return this.remapping && this.remapping.get(value);
  }

  /**
   * Returns whether the field has a human readable remapped value for this value
   * @returns {?string}
   */
  hasRemappedValue(value) {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    if (this.isNumeric() && typeof value !== "number") {
      value = parseFloat(value);
    }

    return this.remapping && this.remapping.has(value);
  }

  /**
   * Returns true if this field can be searched, e.x. in filter or parameter widgets
   * @returns {boolean}
   */
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

  clone(fieldMetadata?: FieldMetadata) {
    if (fieldMetadata instanceof Field) {
      throw new Error("`fieldMetadata` arg must be a plain object");
    }

    const plainObject = this.getPlainObject();
    const newField = new Field({ ...this, ...fieldMetadata });
    newField._plainObject = { ...plainObject, ...fieldMetadata };

    return newField;
  }

  isVirtual() {
    return typeof this.id !== "number";
  }

  /**
   * @private
   * @param {number} id
   * @param {string} name
   * @param {string} display_name
   * @param {string} description
   * @param {Table} table
   * @param {?Field} name_field
   * @param {Metadata} metadata
   */

  /* istanbul ignore next */
  _constructor(
    id,
    name,
    display_name,
    description,
    table,
    name_field,
    metadata,
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
