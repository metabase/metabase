// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import moment from "moment";
import { createLookupByProperty, memoizeClass } from "metabase-lib/lib/utils";
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
  isScope,
  isCategory,
  isAddress,
  isCity,
  isState,
  isZipCode,
  isCountry,
  isCoordinate,
  isLocation,
  isDimension,
  isMetric,
  isPK,
  isFK,
  isEntityName,
  getIconForField,
  getFilterOperators,
} from "metabase/lib/schema_metadata";
import { FieldDimension } from "../Dimension";
import Table from "./Table";
import Base from "./Base";
/**
 * @typedef { import("./metadata").FieldValues } FieldValues
 */

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */

class Field extends Base {
  name: string;
  semantic_type: string | null;
  table?: Table;

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
    includeTable,
    includePath = true,
  } = {}) {
    let displayName = "";

    if (includeTable && this.table) {
      displayName +=
        this.table.displayName({
          includeSchema,
        }) + " → ";
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

  isCity() {
    return isCity(this);
  }

  isZipCode() {
    return isZipCode(this);
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

  isScope() {
    return isScope(this);
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

  /**
   * @param {Field} field
   */
  isCompatibleWith(field) {
    return (
      this.isDate() === field.isDate() ||
      this.isNumeric() === field.isNumeric() ||
      this.id === field.id
    );
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

  icon() {
    return getIconForField(this);
  }

  reference() {
    if (Array.isArray(this.id)) {
      // if ID is an array, it's a MBQL field reference, typically "field"
      return this.id;
    } else {
      return ["field", this.id, null];
    }
  }

  dimension() {
    const ref = this.reference();
    const fieldDimension = new FieldDimension(
      ref[1],
      ref[2],
      this.metadata,
      this.query,
      {
        _fieldInstance: this,
      },
    );

    return fieldDimension;
  }

  sourceField() {
    const d = this.dimension().sourceDimension();
    return d && d.field();
  }

  // FILTERS
  filterOperators(selected) {
    return getFilterOperators(this, this.table, selected);
  }

  filterOperatorsLookup() {
    return createLookupByProperty(this.filterOperators(), "name");
  }

  filterOperator(operatorName) {
    return this.filterOperatorsLookup()[operatorName];
  }

  // @deprecated: use filterOperators
  get filter_operators() {
    return this.filterOperators();
  }

  // @deprecated: use filterOperatorsLookup
  get filter_operators_lookup() {
    return this.filterOperatorsLookup();
  }

  // AGGREGATIONS
  aggregationOperators() {
    return this.table
      ? this.table
          .aggregationOperators()
          .filter(
            aggregation =>
              aggregation.validFieldsFilters[0] &&
              aggregation.validFieldsFilters[0]([this]).length === 1,
          )
      : null;
  }

  aggregationOperatorsLookup() {
    return createLookupByProperty(this.aggregationOperators(), "short");
  }

  aggregationOperator(short) {
    return this.aggregationOperatorsLookup()[short];
  }

  // @deprecated: use aggregationOperators
  get aggregation_operators() {
    return this.aggregationOperators();
  }

  // @deprecated: use aggregationOperatorsLookup
  get aggregation_operators_lookup() {
    return this.aggregationOperatorsLookup();
  }

  // BREAKOUTS

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

      if (Number.isNaN(days) || this.isTime()) {
        return "hour";
      }

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

  // REMAPPINGS

  /**
   * Returns the remapped field, if any
   * @return {?Field}
   */
  remappedField() {
    const displayFieldId =
      this.dimensions && this.dimensions.human_readable_field_id;

    if (displayFieldId != null) {
      return this.metadata.field(displayFieldId);
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

  column(extra = {}) {
    return this.dimension().column({
      source: "fields",
      ...extra,
    });
  }

  /**
   * Returns a FKDimension for this field and the provided field
   * @param {Field} foreignField
   * @return {Dimension}
   */
  foreign(foreignField) {
    return this.dimension().foreign(foreignField.dimension());
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

export default memoizeClass(
  "filterOperators",
  "filterOperatorsLookup",
  "aggregationOperators",
  "aggregationOperatorsLookup",
)(Field);
