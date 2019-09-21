/* @flow weak */

import Base from "./Base";
import Table from "./Table";

import _ from "underscore";
import moment from "moment";

import { FieldIDDimension, FieldLiteralDimension } from "../Dimension";

import { formatField, stripId } from "metabase/lib/formatting";
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
  isAddress,
  isState,
  isCountry,
  isCoordinate,
  isLocation,
  isDimension,
  isMetric,
  isPK,
  isFK,
  isEntityName,
  getIconForField,
  getOperators,
} from "metabase/lib/schema_metadata";

import type { FieldValues } from "metabase/meta/types/Field";

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */
export default class Field extends Base {
  name: string;
  display_name: string;
  description: string;

  table: Table;
  name_field: ?Field;

  parent() {
    return this.metadata ? this.metadata.fields[this.parent_id] : null;
  }

  path() {
    const path = [];
    let field = this;
    do {
      path.unshift(field);
    } while ((field = field.parent()));
    return path;
  }

  displayName({ includeSchema, includeTable, includePath = true } = {}) {
    let displayName = "";
    if (includeTable && this.table) {
      displayName += this.table.displayName({ includeSchema }) + " → ";
    }
    if (includePath) {
      displayName += this.path()
        .map(formatField)
        .join(": ");
    } else {
      displayName += formatField(this);
    }
    return displayName;
  }

  targetDisplayName() {
    return stripId(this.display_name);
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
  isAddress() {
    return isAddress(this);
  }
  isState() {
    return isState(this);
  }
  isCountry() {
    return isCountry(this);
  }
  isCoordinate() {
    return isCoordinate(this);
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

  isCompatibleWith(field: Field) {
    return (
      this.isDate() === field.isDate() ||
      this.isNumeric() === field.isNumeric() ||
      this.id === field.id
    );
  }

  fieldValues(): FieldValues {
    return getFieldValues(this._object);
  }

  icon() {
    return getIconForField(this);
  }

  dimension() {
    if (Array.isArray(this.id) && this.id[0] === "field-literal") {
      return new FieldLiteralDimension(
        null,
        this.id.slice(1),
        this.metadata,
        this.query,
      );
    }
    return new FieldIDDimension(null, [this.id], this.metadata, this.query);
  }

  sourceField() {
    const d = this.dimension().sourceDimension();
    return d && d.field();
  }

  operator(operatorName) {
    if (this.operators_lookup) {
      return this.operators_lookup[operatorName];
    } else {
      return this.operatorOptions().find(o => o.name === operatorName);
    }
  }

  operatorOptions() {
    return this.operators || getOperators(this, this.table);
  }

  aggregations() {
    return this.table
      ? this.table.aggregation_options.filter(
          aggregation =>
            aggregation.validFieldsFilters[0] &&
            aggregation.validFieldsFilters[0]([this]).length === 1,
        )
      : null;
  }

  /**
   * Returns a default breakout MBQL clause for this field
   */
  getDefaultBreakout() {
    return this.dimension().defaultBreakout();
  }

  /**
   * Returns a default date/time unit for this field
   */
  getDefaultDateTimeUnit() {
    try {
      const fingerprint = this.fingerprint.type["type/DateTime"];
      const days = moment(fingerprint.latest).diff(
        moment(fingerprint.earliest),
        "day",
      );
      if (days < 1) {
        return "minute";
      } else if (days < 31) {
        return "day";
      } else if (days < 365) {
        return "week";
      } else {
        return "month";
      }
    } catch (e) {
      return "day";
    }
  }

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
    const remappedField = this.remappedField();
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

  column() {
    return _.pick(
      this.getPlainObject(),
      "id",
      "name",
      "display_name",
      "base_type",
      "special_type",
    );
  }
}
