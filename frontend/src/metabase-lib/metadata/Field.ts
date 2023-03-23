// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import moment from "moment-timezone";

import { formatField, stripId } from "metabase/lib/formatting";
import type {
  DatasetColumn,
  Field as IField,
  FieldFingerprint,
} from "metabase-types/api";
import type { Field as FieldRef } from "metabase-types/types/Query";
import {
  isAddress,
  isBoolean,
  isCategory,
  isCity,
  isComment,
  isCoordinate,
  isCountry,
  isDate,
  isDateWithoutTime,
  isDescription,
  isDimension,
  isEntityName,
  isFK,
  isLocation,
  isMetric,
  isNumber,
  isNumeric,
  isPK,
  isScope,
  isState,
  isString,
  isSummable,
  isTime,
  isZipCode,
} from "metabase-lib/types/utils/isa";
import { getFilterOperators } from "metabase-lib/operators/utils";
import { getFieldValues } from "metabase-lib/queries/utils/field";
import { createLookupByProperty, memoizeClass } from "metabase-lib/utils";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import { FieldDimension } from "../Dimension";
import Base from "./Base";
import type Table from "./Table";
import type Metadata from "./Metadata";
import { getIconForField, getUniqueFieldId } from "./utils/fields";

const LONG_TEXT_MIN = 80;

/**
 * @typedef { import("./Metadata").FieldValues } FieldValues
 */

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */

class FieldInner extends Base {
  id: number | FieldRef;
  name: string;
  description: string | null;
  semantic_type: string | null;
  fingerprint?: FieldFingerprint;
  base_type: string | null;
  table?: Table;
  table_id?: Table["id"];
  target?: Field;
  has_field_values?: "list" | "search" | "none";
  has_more_values?: boolean;
  values: any[];
  metadata?: Metadata;
  source?: string;

  // added when creating "virtual fields" that are associated with a given query
  query?: StructuredQuery | NativeQuery;

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

  isLongText() {
    return (
      isString(this) &&
      (isComment(this) ||
        isDescription(this) ||
        this?.fingerprint?.type?.["type/Text"]?.["average-length"] >=
          LONG_TEXT_MIN)
    );
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
    } else if (this.field_ref) {
      return this.field_ref;
    } else {
      return ["field", this.id, null];
    }
  }

  // 1. `_fieldInstance` is passed in so that we can shortwire any subsequent calls to `field()` form the dimension instance
  // 2. The distinction between "fields" and "dimensions" is fairly fuzzy, and this method is "wrong" in the sense that
  // The `ref` of this Field instance MIGHT be something like ["aggregation", "count"] which means that we should
  // instantiate an AggregationDimension, not a FieldDimension, but there are bugs with that route, and this seems to work for now...
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
    const displayFieldId = this.dimensions?.[0]?.human_readable_field_id;

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

  searchField(disablePKRemapping = false): Field | null {
    if (disablePKRemapping && this.isPK()) {
      return this.isSearchable() ? this : null;
    }

    const remappedField = this.remappedField();
    if (remappedField && remappedField.isSearchable()) {
      return remappedField;
    }

    return this.isSearchable() ? this : null;
  }

  column(extra = {}): DatasetColumn {
    return this.dimension().column({
      source: "fields",
      ...extra,
    });
  }

  remappingOptions = () => {
    const table = this.table;
    if (!table) {
      return [];
    }

    const { fks } = table.query().fieldOptions();
    return fks
      .filter(({ field }) => field.id === this.id)
      .map(({ field, dimension, dimensions }) => ({
        field,
        dimension,
        dimensions: dimensions.filter(d => d.isValidFKRemappingTarget()),
      }));
  };

  clone(fieldMetadata) {
    if (fieldMetadata instanceof Field) {
      throw new Error("`fieldMetadata` arg must be a plain object");
    }

    const plainObject = this.getPlainObject();
    const newField = new Field({ ...this, ...fieldMetadata });
    newField._plainObject = { ...plainObject, ...fieldMetadata };

    return newField;
  }

  /**
   * Returns a FKDimension for this field and the provided field
   * @param {Field} foreignField
   * @return {Dimension}
   */
  foreign(foreignField) {
    return this.dimension().foreign(foreignField.dimension());
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

export default class Field extends memoizeClass<FieldInner>(
  "filterOperators",
  "filterOperatorsLookup",
  "aggregationOperators",
  "aggregationOperatorsLookup",
)(FieldInner) {}
