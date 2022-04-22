// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { ConcreteField, DatetimeUnit } from "metabase-types/types/Query";
import { IconName } from "metabase-types/types";
import { formatBucketing } from "metabase/lib/query_time";

import {
  AggregationOperator,
  FilterOperator,
  Metadata,
  Query,
} from "../metadata/Metadata";
import Field from "../metadata/Field";
import StructuredQuery from "../queries/StructuredQuery";

/**
 * A dimension option returned by the query_metadata API
 */
type DimensionOption = {
  mbql: any;
  name?: string;
};

/* Hierarchy:
 *
 * - Dimension (abstract)
 *   - FieldDimension
 *   - ExpressionDimension
 *   - AggregationDimension
 *   - TemplateTagDimension
 */

/**
 * Dimension base class, represents an MBQL field reference.
 *
 * Used for displaying fields (like Created At) and their "sub-dimensions" (like Created At by Day)
 * in field lists and active value widgets for filters, aggregations and breakouts.
 *
 * @abstract
 */
export default class Dimension {
  _parent: Dimension | null | undefined;
  _args: any;
  _metadata: Metadata | null | undefined;
  _query: Query | null | undefined;
  _options: any;
  // Display names provided by the backend
  _subDisplayName: string | null | undefined;
  _subTriggerDisplayName: string | null | undefined;

  /**
   * Dimension constructor
   */
  constructor(
    parent: Dimension | null | undefined,
    args: any[],
    metadata?: Metadata,
    query?: StructuredQuery | null | undefined,
    options: any,
  ) {
    this._parent = parent;
    this._args = args;
    this._metadata = metadata || (parent && parent._metadata);
    this._query = query || (parent && parent._query);
    this._options = options;
  }

  /**
   * Canonically the field clause should use `null` instead of empty options. Keys with null values should get removed.
   */
  static normalizeOptions(options: any): any {
    if (!options) {
      return null;
    }

    // recursively normalize maps inside options.
    options = _.mapObject(options, val =>
      typeof val === "object" ? this.normalizeOptions(val) : val,
    );
    // remove null/undefined options from map.
    options = _.omit(options, value => value == null);
    return _.isEmpty(options) ? null : options;
  }

  /**
   * Parses an MBQL expression into an appropriate Dimension subclass, if possible.
   * Metadata should be provided if you intend to use the display name or render methods.
   */
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: Metadata,
    query?: StructuredQuery | null | undefined,
  ): Dimension | null | undefined {
    for (const D of DIMENSION_TYPES) {
      const dimension = D.parseMBQL(mbql, metadata, query);

      if (dimension != null) {
        return Object.freeze(dimension);
      }
    }

    return null;
  }

  parseMBQL(mbql: ConcreteField): Dimension | null | undefined {
    return Dimension.parseMBQL(mbql, this._metadata, this._query);
  }

  /**
   * Returns true if these two dimensions are identical to one another.
   */
  static isEqual(
    a: Dimension | null | undefined | ConcreteField,
    b: Dimension | null | undefined,
  ): boolean {
    const dimensionA: Dimension | null | undefined =
      a instanceof Dimension ? a : Dimension.parseMBQL(a);
    const dimensionB: Dimension | null | undefined =
      b instanceof Dimension ? b : Dimension.parseMBQL(b);
    return !!dimensionA && !!dimensionB && dimensionA.isEqual(dimensionB);
  }

  // for nice debugging/console output.
  get [Symbol.toStringTag]() {
    return "mbql = " + JSON.stringify(this.mbql());
  }

  /**
   * Sub-dimensions for the provided dimension of this type.
   * @abstract
   */
  // TODO Atte Keinänen 5/21/17: Rename either this or the instance method with the same name
  // Also making it clear in the method name that we're working with sub-dimensions would be good
  static dimensions(parent: Dimension): Dimension[] {
    return [];
  }

  /**
   * The default sub-dimension for the provided dimension of this type, if any.
   * @abstract
   */
  static defaultDimension(parent: Dimension): Dimension | null | undefined {
    return null;
  }

  /**
   * Returns "sub-dimensions" of this dimension.
   * @abstract
   */
  // TODO Atte Keinänen 5/21/17: Rename either this or the static method with the same name
  // Also making it clear in the method name that we're working with sub-dimensions would be good
  dimensions(DimensionTypes?: typeof Dimension[]): Dimension[] {
    const dimensionOptions = this.field().dimension_options;

    if (!DimensionTypes && dimensionOptions) {
      return dimensionOptions.map(option => this._dimensionForOption(option));
    } else {
      return [].concat(
        ...(DimensionTypes || []).map(DimensionType =>
          DimensionType.dimensions(this),
        ),
      );
    }
  }

  /**
   * Returns the default sub-dimension of this dimension, if any.
   * @abstract
   */
  defaultDimension(
    DimensionTypes: any[] = DIMENSION_TYPES,
  ): Dimension | null | undefined {
    const defaultDimensionOption = this.field().default_dimension_option;

    if (defaultDimensionOption) {
      const dimension = this._dimensionForOption(defaultDimensionOption);

      // NOTE: temporarily disable for DatetimeFieldDimension until backend automatically picks appropriate bucketing
      if (!(isFieldDimension(dimension) && dimension.temporalUnit())) {
        return dimension;
      }
    }

    for (const DimensionType of DimensionTypes) {
      const defaultDimension = DimensionType.defaultDimension(this);

      if (defaultDimension) {
        return defaultDimension;
      }
    }

    return null;
  }

  /**
   * Internal method gets a Dimension from a DimensionOption
   */
  _dimensionForOption(option: DimensionOption) {
    // fill in the parent field ref
    const fieldRef = this.baseDimension().mbql();
    let mbql = option.mbql;

    if (mbql) {
      mbql = [mbql[0], fieldRef, ...mbql.slice(2)];
    } else {
      mbql = fieldRef;
    }

    const dimension = this.parseMBQL(mbql);

    if (dimension && option.name) {
      dimension._subDisplayName = option.name;
      dimension._subTriggerDisplayName = option.name;
    }

    return dimension;
  }

  /**
   * Is this dimension idential to another dimension or MBQL clause
   */
  isEqual(other: Dimension | null | undefined | ConcreteField): boolean {
    if (other == null) {
      return false;
    }

    const otherDimension: Dimension | null | undefined =
      other instanceof Dimension ? other : this.parseMBQL(other);

    if (!otherDimension) {
      return false;
    }

    // assumes .mbql() returns canonical form
    return _.isEqual(this.mbql(), otherDimension.mbql());
  }

  /**
   * Does this dimension have the same underlying base dimension, typically a field
   */
  isSameBaseDimension(
    other: Dimension | null | undefined | ConcreteField,
  ): boolean {
    if (other == null) {
      return false;
    }

    const otherDimension: Dimension | null | undefined =
      other instanceof Dimension ? other : this.parseMBQL(other);
    const baseDimensionA = this.baseDimension();
    const baseDimensionB = otherDimension && otherDimension.baseDimension();
    return (
      !!baseDimensionA &&
      !!baseDimensionB &&
      baseDimensionA.isEqual(baseDimensionB)
    );
  }

  foreign(dimension: Dimension): FieldDimension {
    return null;
  }

  datetime(unit: DatetimeUnit): FieldDimension {
    return null;
  }

  /**
   * The underlying field for this dimension
   */
  field(): Field {
    return new Field();
  }

  /**
   * The `name` appearing in the column object (except duplicates would normally be suffxied)
   */
  columnName(): string {
    return this.field().name;
  }

  // FILTERS

  /**
   * Valid filter operators on this dimension
   */
  filterOperators(selected): FilterOperator[] {
    return this.field().filterOperators(selected);
  }

  /**
   * The operator with the provided operator name (e.x. `=`, `<`, etc)
   */
  filterOperator(operatorName: string): FilterOperator | null | undefined {
    return this.field().filterOperator(operatorName);
  }

  /**
   * The default filter operator for this dimension
   */
  defaultFilterOperator(): FilterOperator | null | undefined {
    // let the DatePicker choose the default operator, otherwise use the first one
    // TODO: replace with a defaultFilter()- or similar which includes arguments
    return this.field().isDate() ? null : this.filterOperators()[0];
  }

  // AGGREGATIONS

  /**
   * Valid aggregation operators on this dimension
   */
  aggregationOperators(): AggregationOperator[] {
    return this.field().aggregationOperators();
  }

  /**
   * Valid filter operators on this dimension
   */
  aggregationOperator(
    operatorName: string,
  ): AggregationOperator | null | undefined {
    return this.field().aggregationOperator(operatorName);
  }

  defaultAggregationOperator(): AggregationOperator | null | undefined {
    return this.aggregationOperators()[0];
  }

  defaultAggregation() {
    const aggregation = this.defaultAggregationOperator();

    if (aggregation) {
      return [aggregation.short, this.mbql()];
    }

    return null;
  }

  // BREAKOUTS

  /**
   * Returns MBQL for the default breakout
   *
   * Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
   * and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.
   */
  defaultBreakout() {
    const defaultSubDimension = this.defaultDimension();

    if (defaultSubDimension) {
      return defaultSubDimension.mbql();
    } else {
      return this.mbql();
    }
  }

  /**
   * The display name of this dimension, e.x. the field's display_name
   * @abstract
   */
  displayName(): string {
    return "";
  }

  column(extra = {}) {
    const field = this.baseDimension().field();
    return {
      id: field.id,
      base_type: field.base_type,
      semantic_type: field.semantic_type,
      name: this.columnName(),
      display_name: this.displayName(),
      field_ref: this.mbql(),
      ...extra,
    };
  }

  /**
   * An icon name representing this dimension's type, to be used in the <Icon> component.
   * @abstract
   */
  icon(): IconName | null | undefined {
    return null;
  }

  query(): StructuredQuery | null | undefined {
    return this._query;
  }

  sourceDimension() {
    return this._query && this._query.dimensionForSourceQuery(this);
  }

  /**
   * Get an option from the field options map, if there is one.
   */
  getOption(k: string): any {
    return this._options && this._options[k];
  }

  /*
   * The temporal unit that is being used to bucket this Field, if any.
   */
  temporalUnit() {
    return this.getOption("temporal-unit");
  }

  /**
   * Whether temporal bucketing is being applied, *and* the bucketing is a truncation operation such as "month" or
   * "quarter";
   */
  isTemporalExtraction(): boolean {
    return this.temporalUnit() && /-of-/.test(this.temporalUnit());
  }

  /**
   * Whether temporal bucketing is being applied, *and* the bucketing is an truncation operation such as "day of month";
   */
  isTemporalTruncation(): boolean {
    return this.temporalUnit() && !this.isTemporalExtraction();
  }

  // binning-strategy stuff
  binningOptions() {
    return this.getOption("binning");
  }

  getBinningOption(option) {
    return this.binningOptions() && this.binningOptions()[option];
  }

  binningStrategy() {
    return this.getBinningOption("strategy");
  }

  /**
   * Short string that describes the binning options used. Used for both subTriggerDisplayName() and render()
   */
  describeBinning(): string {
    if (!this.binningOptions()) {
      return "";
    }

    if (this.binningStrategy() === "num-bins") {
      const n = this.getBinningOption("num-bins");
      return ngettext(msgid`${n} bin`, `${n} bins`, n);
    }

    if (this.binningStrategy() === "bin-width") {
      const binWidth = this.getBinningOption("bin-width");
      const units = this.field().isCoordinate() ? "°" : "";
      return `${binWidth}${units}`;
    } else {
      return t`Auto binned`;
    }
  }

  /**
   * Return the join alias associated with this field, if any.
   */
  joinAlias() {
    return this.getOption("join-alias");
  }

  sourceField() {
    return this.getOption("source-field");
  }

  /**
   * Return a copy of this Dimension that includes the specified `options`.
   * @abstract
   */
  withOptions(options: any): Dimension {
    return this;
  }

  /**
   * Return a copy of this Dimension with option `key` set to `value`.
   */
  withOption(key: string, value: any): Dimension {
    return this.withOptions({
      [key]: value,
    });
  }

  /**
   * Return a copy of this Dimension, bucketed by the specified temporal unit.
   */
  withTemporalUnit(unit: string): Dimension {
    return this.withOptions({
      "temporal-unit": unit,
    });
  }

  /**
   * Return a copy of this Dimension, with its binning options replaced by the new ones.
   */
  withBinningOptions(newBinningOptions) {
    return this.withOptions({
      binning: newBinningOptions,
    });
  }

  /**
   * Return a copy of this Dimension with join alias set to `newAlias`.
   */
  withJoinAlias(newAlias) {
    return this.withOptions({
      "join-alias": newAlias,
    });
  }

  /**
   * Return a copy of this Dimension with a replacement source field.
   */
  withSourceField(sourceField) {
    return this.withOptions({
      "source-field": sourceField,
    });
  }

  /**
   * Return a copy of this Dimension that excludes `options`.
   * @abstract
   */
  withoutOptions(...options: string[]): Dimension {
    return this;
  }

  /**
   * Return a copy of this Dimension with any temporal unit options removed.
   */
  withoutTemporalBucketing(): Dimension {
    return this.withoutOptions("temporal-unit");
  }

  /**
   * Return a copy of this Dimension with any binning options removed.
   */
  withoutBinning(): Dimension {
    return this.withoutOptions("binning");
  }

  /**
   * Return a copy of this Dimension with any temporal bucketing or binning options removed.
   */
  baseDimension(): Dimension {
    return this.withoutTemporalBucketing().withoutBinning();
  }

  /**
   * The name to be shown when this dimension is being displayed as a sub-dimension of another.
   *
   * Example: a temporal bucketing option such as 'by Day' or 'by Month'.
   */
  subDisplayName(): string {
    if (this._subDisplayName) {
      return this._subDisplayName;
    }

    if (this.temporalUnit()) {
      return formatBucketing(this.temporalUnit());
    }

    if (this.binningStrategy()) {
      return this.describeBinning();
    }

    // honestly, I have no idea why we do something totally random if we have a FK source field compared to everything
    // else, but that's how the tests are written
    if (this.sourceField()) {
      return this.displayName();
    }

    return "Default";
  }

  /**
   * A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
   * bucketing options like 'Day' or 'Month')
   */
  subTriggerDisplayName(): string {
    if (this._subTriggerDisplayName) {
      return this._subTriggerDisplayName;
    }

    // binned field
    if (this.binningOptions()) {
      return this.describeBinning();
    }

    // temporal bucketed field
    if (this.temporalUnit()) {
      return t`by ${formatBucketing(this.temporalUnit()).toLowerCase()}`;
    }

    // if the field is a binnable number, we should return 'Unbinned' here
    if (this.isBinnable()) {
      return t`Unbinned`;
    }

    return "";
  }

  /**
   * Whether this is a numeric Field that can be binned
   */
  isBinnable(): boolean {
    const defaultDimension = this.defaultDimension();
    return (
      defaultDimension &&
      isFieldDimension(defaultDimension) &&
      defaultDimension.binningOptions()
    );
  }

  /**
   * Renders a dimension to a string for display in query builders
   */
  render() {
    return this._parent ? this._parent.render() : this.displayName();
  }

  mbql() {
    throw new Error("Abstract method `mbql` not implemented");
  }

  key() {
    return JSON.stringify(this.mbql());
  }
}
