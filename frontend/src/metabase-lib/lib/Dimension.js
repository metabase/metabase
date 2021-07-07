import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { stripId, FK_SYMBOL } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";

import Field from "./metadata/Field";
import type {
  AggregationOperator,
  FilterOperator,
  Metadata,
  Query,
} from "./metadata/Metadata";

import type {
  ConcreteField,
  LocalFieldReference,
  ExpressionReference,
  DatetimeUnit,
} from "metabase-types/types/Query";

import type { IconName } from "metabase-types/types";

import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";
import type Aggregation from "./queries/structured/Aggregation";
import StructuredQuery from "./queries/StructuredQuery";

import { infer, MONOTYPE } from "metabase/lib/expressions/typeinferencer";

/**
 * A dimension option returned by the query_metadata API
 */
type DimensionOption = {
  mbql: any,
  name?: string,
};

/* Heirarchy:
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
  _parent: ?Dimension;
  _args: any;
  _metadata: ?Metadata;
  _query: ?Query;

  // Display names provided by the backend
  _subDisplayName: ?String;
  _subTriggerDisplayName: ?String;

  /**
   * Dimension constructor
   */
  constructor(
    parent: ?Dimension,
    args: any[],
    metadata?: Metadata,
    query?: ?StructuredQuery,
  ) {
    this._parent = parent;
    this._args = args;
    this._metadata = metadata || (parent && parent._metadata);
    this._query = query || (parent && parent._query);
  }

  /**
   * Parses an MBQL expression into an appropriate Dimension subclass, if possible.
   * Metadata should be provided if you intend to use the display name or render methods.
   */
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    for (const D of DIMENSION_TYPES) {
      const dimension = D.parseMBQL(mbql, metadata, query);
      if (dimension != null) {
        return Object.freeze(dimension);
      }
    }
    return null;
  }

  parseMBQL(mbql: ConcreteField): ?Dimension {
    return Dimension.parseMBQL(mbql, this._metadata, this._query);
  }

  /**
   * Returns true if these two dimensions are identical to one another.
   */
  static isEqual(a: ?Dimension | ConcreteField, b: ?Dimension): boolean {
    const dimensionA: ?Dimension =
      a instanceof Dimension ? a : Dimension.parseMBQL(a);
    const dimensionB: ?Dimension =
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
  static defaultDimension(parent: Dimension): ?Dimension {
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
  defaultDimension(DimensionTypes: any[] = DIMENSION_TYPES): ?Dimension {
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
  isEqual(other: ?Dimension | ConcreteField): boolean {
    if (other == null) {
      return false;
    }

    const otherDimension: ?Dimension =
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
  isSameBaseDimension(other: ?Dimension | ConcreteField): boolean {
    if (other == null) {
      return false;
    }

    const otherDimension: ?Dimension =
      other instanceof Dimension ? other : this.parseMBQL(other);

    const baseDimensionA = this.baseDimension();
    const baseDimensionB = otherDimension && otherDimension.baseDimension();

    return (
      !!baseDimensionA &&
      !!baseDimensionB &&
      baseDimensionA.isEqual(baseDimensionB)
    );
  }

  /**
   * The base dimension of this dimension, typically a field. May return itself.
   */
  baseDimension(): Dimension {
    return this;
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
  filterOperator(operatorName: string): ?FilterOperator {
    return this.field().filterOperator(operatorName);
  }

  /**
   * The default filter operator for this dimension
   */
  defaultFilterOperator(): ?FilterOperator {
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
  aggregationOperator(operatorName: string): ?AggregationOperator {
    return this.field().aggregationOperator(operatorName);
  }

  defaultAggregationOperator(): ?AggregationOperator {
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
   * The name to be shown when this dimension is being displayed as a sub-dimension of another.
   *
   * Example: a temporal bucketing option such as 'by Day' or 'by Month'.
   * @abstract
   */
  subDisplayName(): string {
    return this._subDisplayName || "";
  }

  /**
   * A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
   * bucketing options like 'Day' or 'Month')
   * @abstract
   */
  subTriggerDisplayName(): string {
    return this._subTriggerDisplayName || "";
  }

  /**
   * An icon name representing this dimension's type, to be used in the <Icon> component.
   * @abstract
   */
  icon(): ?IconName {
    return null;
  }

  query(): ?StructuredQuery {
    return this._query;
  }

  sourceDimension() {
    return this._query && this._query.dimensionForSourceQuery(this);
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

/**
 * `:field` clause e.g. `["field", fieldIdOrName, options]`
 */
export class FieldDimension extends Dimension {
  /**
   * Whether `clause` is an array, and a valid `:field` clause
   */
  static isFieldClause(clause): boolean {
    return (
      Array.isArray(clause) && clause.length === 3 && clause[0] === "field"
    );
  }

  static parseMBQL(mbql, metadata = null, query = null): ?FieldDimension {
    if (FieldDimension.isFieldClause(mbql)) {
      return Object.freeze(
        new FieldDimension(mbql[1], mbql[2], metadata, query),
      );
    }
    return null;
  }

  /**
   * Parse MBQL field clause or log a warning message if it could not be parsed. Use this when you expect the clause to
   * be a `:field` clause
   */
  static parseMBQLOrWarn(mbql, metadata = null, query = null): ?FieldDimension {
    // if some some reason someone passes in a raw integer ID instead of a proper Field form, go ahead and parse it
    // anyway -- there seems to be a lot of code that does this -- but log an error message so we can fix it.
    if (typeof mbql === "number") {
      console.error(
        "FieldDimension.parseMBQLOrWarn() called with a raw integer Field ID. This is an error. Fixme!",
        mbql,
      );
      return FieldDimension.parseMBQLOrWarn(
        ["field", mbql, null],
        metadata,
        query,
      );
    }
    const dimension = FieldDimension.parseMBQL(mbql, metadata, query);
    if (!dimension) {
      console.warn("Unknown MBQL Field clause", mbql);
    }
    return dimension;
  }

  /**
   * Canonically the field clause should use `null` instead of empty options. Keys with null values should get removed.
   */
  static normalizeOptions(options: {}): {} {
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

  constructor(
    fieldIdOrName,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(null, [fieldIdOrName, options], metadata, query);
    this._fieldIdOrName = fieldIdOrName;
    this._options = Object.freeze(FieldDimension.normalizeOptions(options));

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  isEqual(somethingElse) {
    if (isFieldDimension(somethingElse)) {
      return (
        somethingElse._fieldIdOrName === this._fieldIdOrName &&
        _.isEqual(somethingElse._options, this._options)
      );
    }
    // this should be considered equivalent to an equivalent MBQL clause
    if (FieldDimension.isFieldClause(somethingElse)) {
      const dimension = FieldDimension.parseMBQL(
        somethingElse,
        this._metadata,
        this._query,
      );
      return dimension ? this.isEqual(dimension) : false;
    }
    return false;
  }

  mbql(): LocalFieldReference {
    return ["field", this._fieldIdOrName, this._options];
  }

  /**
   * Get an option from the field options map, if there is one.
   */
  getOption(k: string): any {
    return this._options && this._options[k];
  }

  /**
   * Return integer ID *or* string name of the Field this `field` clause refers to.
   */
  fieldIdOrName(): string | number {
    return this._fieldIdOrName;
  }

  /**
   * Whether this Field clause has an integer Field ID (as opposed to a string Field name).
   */
  isIntegerFieldId(): boolean {
    return typeof this._fieldIdOrName === "number";
  }

  /**
   * Whether this Field clause has a string Field name (as opposed to an integer Field ID). This generally means the
   * Field comes from a native query.
   */
  isStringFieldName(): boolean {
    return typeof this._fieldIdOrName === "string";
  }

  field(): {} {
    if (this.isIntegerFieldId()) {
      return (
        (this._metadata && this._metadata.field(this._fieldIdOrName)) ||
        new Field({
          id: this._fieldIdOrName,
          metadata: this._metadata,
          query: this._query,
        })
      );
    }

    if (this._query) {
      // TODO: more efficient lookup
      const field = _.findWhere(this._query.table().fields, {
        name: this._fieldIdOrName,
      });
      if (field) {
        return field;
      }
    }
    return new Field({
      id: this.mbql(),
      name: this._fieldIdOrName,
      // NOTE: this display_name will likely be incorrect
      // if a `FieldDimension` isn't associated with a query then we don't know which table it belongs to
      display_name: this._fieldIdOrName,
      base_type: this.getOption("base-type"),
      // HACK: need to thread the query through to this fake Field
      query: this._query,
      metadata: this._metadata,
    });
  }

  /**
   * Return a copy of this FieldDimension that excludes `options`.
   */
  withoutOptions(...options: string[]): FieldDimension {
    // optimization: if we don't have any options, we can return ourself as-is
    if (!this._options) {
      return this;
    }

    return new FieldDimension(
      this._fieldIdOrName,
      _.omit(this._options, ...options),
      this._metadata,
      this._query,
    );
  }

  /**
   * Return a copy of this FieldDimension with any temporal bucketing options removed.
   */
  withoutTemporalBucketing(): FieldDimension {
    return this.withoutOptions("temporal-unit");
  }

  /**
   * Return a copy of this FieldDimension with any binning options removed.
   */
  withoutBinning(): FieldDimension {
    return this.withoutOptions("binning");
  }

  /**
   * Return a copy of this FieldDimension with any temporal bucketing or binning options removed.
   */
  baseDimension(): FieldDimension {
    return this.withoutTemporalBucketing().withoutBinning();
  }

  /**
   * Return a copy of this FieldDimension that includes the specified `options`.
   */
  withOptions(options: {}): FieldDimension {
    // optimization : if options is empty return self as-is
    if (!options || !Object.entries(options).length) {
      return this;
    }

    return new FieldDimension(
      this._fieldIdOrName,
      { ...this._options, ...options },
      this._metadata,
      this._query,
    );
  }

  /**
   * Return a copy of this FieldDimension with option `key` set to `value`.
   */
  withOption(key: string, value: any): FieldDimension {
    return this.withOptions({
      [key]: value,
    });
  }

  /**
   * Return a copy of this FieldDimension, bucketed by the specified temporal unit.
   */
  withTemporalUnit(unit: string): FieldDimension {
    return this.withOptions({ "temporal-unit": unit });
  }

  // no idea what this does or if it's even used anywhere.
  foreign(dimension: Dimension): FieldDimension {
    if (isFieldDimension(dimension)) {
      return dimension.withSourceField(this._fieldIdOrName);
    }
  }
  columnName() {
    return this.isIntegerFieldId() ? super.columnName() : this._fieldIdOrName;
  }

  displayName(...args) {
    return this.field().displayName(...args);
  }

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

  icon() {
    return this.field().icon();
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
   * Whether this is a numeric Field that can be binned
   */
  isBinnable(): boolean {
    const defaultDimension = this.defaultDimension();
    return (
      isFieldDimension(defaultDimension) && defaultDimension.binningOptions()
    );
  }

  dimensions(DimensionTypes?: typeof Dimension[]): FieldDimension[] {
    let dimensions = super.dimensions(DimensionTypes);

    const joinAlias = this.joinAlias();
    if (joinAlias) {
      return dimensions.map(d => d.withJoinAlias(joinAlias));
    }

    const sourceField = this.sourceField();
    if (sourceField) {
      return dimensions.map(d => d.withSourceField(sourceField));
    }

    const field = this.field();

    // Add FK dimensions if this field is an FK
    if (field.target && field.target.table && field.target.table.fields) {
      const fkDimensions = field.target.table.fields.map(
        field =>
          new FieldDimension(
            field.id,
            { "source-field": this._fieldIdOrName },
            this._metadata,
            this._query,
          ),
      );
      dimensions = [...dimensions, ...fkDimensions];
    }

    // Add temporal dimensions
    if (field.isDate() && !this.isIntegerFieldId()) {
      const temporalDimensions = _.difference(
        DATETIME_UNITS,
        dimensions.map(dim => dim.temporalUnit()),
      ).map(unit => this.withTemporalUnit(unit));
      dimensions = [...dimensions, ...temporalDimensions];
    }

    const baseType = this.getOption("base-type");
    if (baseType) {
      dimensions = dimensions.map(dimension =>
        dimension.withOption("base-type", baseType),
      );
    }

    return dimensions;
  }

  defaultDimension(dimensionTypes = []): FieldDimension {
    const field = this.field();
    if (field && field.isDate()) {
      return this.withTemporalUnit(field.getDefaultDateTimeUnit());
    }

    let dimension = super.defaultDimension(dimensionTypes);

    if (!dimension) {
      return null;
    }

    const sourceField = this.sourceField();
    if (sourceField) {
      dimension = dimension.withSourceField(sourceField);
    }

    const joinAlias = this.joinAlias();
    if (joinAlias) {
      dimension = dimension.withJoinAlias(joinAlias);
    }

    const baseType = this.getOption("base-type");
    if (baseType) {
      dimension = dimension.withOption("base-type", baseType);
    }

    return dimension;
  }

  _dimensionForOption(option): FieldDimension {
    const dimension = option.mbql
      ? FieldDimension.parseMBQLOrWarn(option.mbql, this._metadata, this._query)
      : this;

    if (!dimension) {
      console.warn(
        "Don't know how to create Dimension for option",
        this,
        option,
      );
      return null;
    }

    const additionalProperties = {
      _fieldIdOrName: this._fieldIdOrName,
    };

    if (option.name) {
      additionalProperties._subDisplayName = option.name;
      additionalProperties._subTriggerDisplayName = option.name;
    }

    return new FieldDimension(
      dimension._fieldIdOrName,
      dimension._options,
      this._metadata,
      this._query,
      additionalProperties,
    );
  }

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
      return "Unbinned";
    }

    return "";
  }

  render(): string {
    let displayName = this.displayName();

    if (this.fk()) {
      const fkDisplayName =
        this.fk() &&
        stripId(
          this.fk()
            .field()
            .displayName(),
        );
      displayName = `${fkDisplayName} ${FK_SYMBOL} ${displayName}`;
    } else if (this.joinAlias()) {
      displayName = `${this.joinAlias()} ${FK_SYMBOL} ${displayName}`;
    }

    if (this.temporalUnit()) {
      displayName = `${displayName}: ${formatBucketing(this.temporalUnit())}`;
    }

    if (this.binningOptions()) {
      displayName = `${displayName}: ${this.describeBinning()}`;
    }

    return displayName;
  }

  column(extra = {}) {
    const more = {};
    if (typeof this.sourceField() === "number") {
      more.fk_field_id = this.sourceField();
    }
    if (this.temporalUnit()) {
      more.unit = this.temporalUnit();
    }

    return {
      ...super.column(),
      ...more,
      ...extra,
    };
  }

  /**
   * For `:field` clauses with an FK source field, returns a new Dimension for the source field.
   */
  fk() {
    const sourceFieldIdOrName = this.sourceField();
    if (!sourceFieldIdOrName) {
      return null;
    }

    return new FieldDimension(
      sourceFieldIdOrName,
      null,
      this._metadata,
      this._query,
    );
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

  sourceField() {
    return this.getOption("source-field");
  }

  withSourceField(sourceField) {
    return this.withOptions({ "source-field": sourceField });
  }

  /**
   * Return the join alias associated with this field, if any.
   */
  joinAlias() {
    return this.getOption("join-alias");
  }

  /**
   * Return a copy of this field with join alias set to `newAlias`.
   */
  withJoinAlias(newAlias) {
    return this.withOptions({ "join-alias": newAlias });
  }

  join() {
    return this.joinAlias()
      ? _.findWhere(this._query && this._query.joins(), {
          alias: this.joinAlias(),
        })
      : null;
  }

  // binning-strategy stuff
  binningOptions() {
    return this.getOption("binning");
  }

  withBinningOptions(newBinningOptions) {
    return this.withOptions({ binning: newBinningOptions });
  }

  getBinningOption(option) {
    return this.binningOptions() && this.binningOptions()[option];
  }

  binningStrategy() {
    return this.getBinningOption("strategy");
  }
}

const isFieldDimension = dimension => dimension instanceof FieldDimension;

/**
 * Expression reference, `["expression", expression-name]`
 */
export class ExpressionDimension extends Dimension {
  tag = "Custom";

  static parseMBQL(
    mbql: any,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    if (Array.isArray(mbql) && mbql[0] === "expression") {
      return new ExpressionDimension(null, mbql.slice(1), metadata, query);
    }
  }

  mbql(): ExpressionReference {
    return ["expression", this._args[0]];
  }

  name() {
    return this._args[0];
  }

  displayName(): string {
    return this._args[0];
  }

  columnName() {
    return this._args[0];
  }

  field() {
    const query = this._query;
    const table = query ? query.table() : null;

    let type = MONOTYPE.Number; // fallback
    if (query) {
      const datasetQuery = query.query();
      const expressions = datasetQuery ? datasetQuery.expressions : {};
      const env = mbql => {
        const dimension = Dimension.parseMBQL(
          mbql,
          this._metadata,
          this._query,
        );
        return dimension.field().base_type;
      };
      type = infer(expressions[this.name()], env);
    } else {
      type = infer(this._args[0]);
    }

    let base_type = type;
    if (!type.startsWith("type/")) {
      base_type = "type/Float"; // fallback
      switch (type) {
        case MONOTYPE.String:
          base_type = "type/Text";
          break;
        case MONOTYPE.Boolean:
          base_type = "type/Boolean";
          break;
        default:
          break;
      }
    }

    return new Field({
      id: this.mbql(),
      name: this.name(),
      display_name: this.displayName(),
      semantic_type: null,
      base_type,
      query,
      table,
    });
  }

  icon(): IconName {
    const { base_type } = this.field();
    switch (base_type) {
      case "type/Text":
        return "string";
      default:
        break;
    }

    return "int";
  }
}

// These types aren't aggregated. e.g. if you take the distinct count of a FK
// column, you now have a normal integer and should see relevant filters for
// that type.
const UNAGGREGATED_SEMANTIC_TYPES = new Set([TYPE.FK, TYPE.PK]);

/**
 * Aggregation reference, `["aggregation", aggregation-index]`
 */
export class AggregationDimension extends Dimension {
  static parseMBQL(
    mbql: any,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    if (Array.isArray(mbql) && mbql[0] === "aggregation") {
      return new AggregationDimension(null, mbql.slice(1), metadata, query);
    }
  }

  aggregationIndex(): number {
    return this._args[0];
  }

  column(extra = {}) {
    return {
      ...super.column(),
      source: "aggregation",
      ...extra,
    };
  }

  field() {
    const aggregation = this.aggregation();
    if (!aggregation) {
      return super.field();
    }
    const dimension = aggregation.dimension();
    const field = dimension && dimension.field();
    const { semantic_type } = field || {};
    return new Field({
      name: aggregation.columnName(),
      display_name: aggregation.displayName(),
      base_type: aggregation.baseType(),
      // don't pass through `semantic_type` when aggregating these types
      ...(!UNAGGREGATED_SEMANTIC_TYPES.has(semantic_type) && { semantic_type }),
      query: this._query,
      metadata: this._metadata,
    });
  }

  /**
   * Raw aggregation
   */
  _aggregation(): Aggregation {
    return this._query && this._query.aggregations()[this.aggregationIndex()];
  }

  /**
   * Underlying aggregation, with aggregation-options removed
   */
  aggregation() {
    const aggregation = this._aggregation();
    if (aggregation) {
      return aggregation.aggregation();
    }
    return null;
  }

  displayName(): string {
    const aggregation = this._aggregation();
    if (aggregation) {
      return aggregation.displayName();
    }
    return null;
  }

  columnName() {
    const aggregation = this._aggregation();
    if (aggregation) {
      return aggregation.columnName();
    }
    return null;
  }

  mbql() {
    return ["aggregation", this._args[0]];
  }

  icon() {
    return "int";
  }
}

export class TemplateTagDimension extends FieldDimension {
  constructor(tagName, metadata, query) {
    super(null, null, metadata, query, {
      _tagName: tagName,
    });
  }

  dimension() {
    if (this._query) {
      const tag = this.tag();
      if (tag && tag.type === "dimension") {
        return this.parseMBQL(tag.dimension);
      }
    }
    return null;
  }

  tag() {
    return this._query.templateTagsMap()[this.tagName()];
  }

  field() {
    const dimension = this.dimension();
    return dimension ? dimension.field() : super.field();
  }

  name() {
    return this.field().name;
  }

  tagName() {
    return this._tagName;
  }

  displayName() {
    const tag = this.tag();
    return (tag && tag["display-name"]) || super.displayName();
  }

  mbql() {
    return ["template-tag", this.tagName()];
  }
}

const DIMENSION_TYPES: typeof Dimension[] = [
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
];
