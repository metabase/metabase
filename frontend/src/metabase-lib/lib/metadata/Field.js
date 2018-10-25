/* @flow weak */

import Base from "./Base";
import Table from "./Table";

import { FieldIDDimension } from "../Dimension";

import { getFieldValues } from "metabase/lib/query/field";
import {
  isDate,
  isTime,
  isNumber,
  isNumeric,
  isBoolean,
  isString,
  isSummable,
  isCategory,
  isLocation,
  isDimension,
  isMetric,
  isPK,
  isFK,
  isEntityName,
  isCoordinate,
  getIconForField,
  getFieldType,
} from "metabase/lib/schema_metadata";

import type { FieldValues } from "metabase/meta/types/Field";

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */
export default class Field extends Base {
  displayName: string;
  description: string;

  table: Table;
  name_field: ?Field;

  fieldType() {
    return getFieldType(this);
  }

  isDate() {
    return isDate(this);
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
  isBoolean() {
    return isBoolean(this);
  }
  isString() {
    return isString(this);
  }
  isLocation() {
    return isLocation(this);
  }
  isSummable() {
    return isSummable(this);
  }
  isCategory() {
    return isCategory(this);
  }
  isMetric() {
    return isMetric(this);
  }

  isCompatibleWith(field: Field) {
    return (
      this.isDate() === field.isDate() ||
      this.isNumeric() === field.isNumeric() ||
      this.id === field.id
    );
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
  isEntityName() {
    return isEntityName(this);
  }

  isCoordinate() {
    return isCoordinate(this);
  }

  fieldValues(): FieldValues {
    return getFieldValues(this._object);
  }

  icon() {
    return getIconForField(this);
  }

  dimension() {
    return new FieldIDDimension(null, [this.id], this.metadata);
  }

  operator(op) {
    if (this.operators_lookup) {
      return this.operators_lookup[op];
    }
  }

  /**
   * Returns a default breakout MBQL clause for this field
   *
   * Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
   * and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.
   */
  getDefaultBreakout = () => {
    const fieldIdDimension = this.dimension();
    const defaultSubDimension = fieldIdDimension.defaultDimension();
    if (defaultSubDimension) {
      return defaultSubDimension.mbql();
    } else {
      return fieldIdDimension.mbql();
    }
  };

  /**
   * Returns the remapped field, if any
   */
  remappedField(): ?Field {
    const displayFieldId =
      this.dimensions && this.dimensions.human_readable_field_id;
    if (displayFieldId != null) {
      return this.metadata.fields[displayFieldId];
    }
    // this enables "implicit" remappings from type/PK to type/Name on the same table,
    // used in FieldValuesWidget, but not table/object detail listings
    if (this.name_field) {
      return this.name_field;
    }
    return null;
  }

  /**
   * Returns the human readable remapped value, if any
   */
  remappedValue(value): ?string {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    if (this.isNumeric() && typeof value !== "number") {
      value = parseFloat(value);
    }
    return this.remapping && this.remapping.get(value);
  }

  /**
   * Returns whether the field has a human readable remapped value for this value
   */
  hasRemappedValue(value): ?string {
    // TODO: Ugh. Should this be handled further up by the parameter widget?
    if (this.isNumeric() && typeof value !== "number") {
      value = parseFloat(value);
    }
    return this.remapping && this.remapping.has(value);
  }

  /**
   * Returns true if this field can be searched, e.x. in filter or parameter widgets
   */
  isSearchable(): boolean {
    // TODO: ...?
    return this.isString();
  }

  /**
   * Returns the field to be searched for this field, either the remapped field or itself
   */
  parameterSearchField(): ?Field {
    let remappedField = this.remappedField();
    if (remappedField && remappedField.isSearchable()) {
      return remappedField;
    }
    if (this.isSearchable()) {
      return this;
    }
    return null;
  }

  filterSearchField(): ?Field {
    if (this.isPK()) {
      if (this.isSearchable()) {
        return this;
      }
    } else {
      return this.parameterSearchField();
    }
  }
}
