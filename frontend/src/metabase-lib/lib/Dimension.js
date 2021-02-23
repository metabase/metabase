import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { stripId, FK_SYMBOL } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";

import Field from "./metadata/Field";
import type Metadata from "./metadata/Metadata";

import type {
  ConcreteField,
  LocalFieldReference,
  // ForeignFieldReference,
  DatetimeField,
  ExpressionReference,
  DatetimeUnit,
} from "metabase-types/types/Query";

import type { IconName } from "metabase-types/types";

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
        return dimension;
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
      a instanceof Dimension
        ? a
        : // $FlowFixMe
          Dimension.parseMBQL(a);
    const dimensionB: ?Dimension =
      b instanceof Dimension
        ? b
        : // $FlowFixMe
          Dimension.parseMBQL(b);
    return !!dimensionA && !!dimensionB && dimensionA.isEqual(dimensionB);
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
      if (!(dimension instanceof FieldDimension && dimension.temporalUnit())) {
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

  // Internal method gets a Dimension from a DimensionOption
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

    if (option.name) {
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

  foreign(dimension: Dimension): FKDimension {
    return new FKDimension(
      this,
      [dimension.mbql()],
      this._metadata,
      this._query,
    );
  }

  datetime(unit: DatetimeUnit): DatetimeFieldDimension {
    return new DatetimeFieldDimension(
      this,
      [unit],
      this._metadata,
      this._query,
    );
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
   * The name to be shown when this dimension is being displayed as a sub-dimension of another
   * @abstract
   */
  subDisplayName(): string {
    return this._subDisplayName || "";
  }

  /**
   * A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger
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
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ) {
    if (Array.isArray(mbql) && mbql[0] === "field") {
      return new FieldDimension(mbql[1], mbql[2], metadata, query);
    }
    return null;
  }

  constructor(fieldIdOrName, options, metadata, query) {
    super(null, [fieldIdOrName, options], metadata, query);
    this._fieldIdOrName = fieldIdOrName;
    this._options = options;
  }

  mbql(): LocalFieldReference {
    return ["field", this._fieldIdOrName, this._options];
  }

  /**
   * Get an option from the field options map, if there is one.
   */
  getOption(k) {
    return this._options && this._options[k];
  }

  /**
   * Whether this Field clause has an integer Field ID (as opposed to a string Field name).
   */
  isIntegerFieldId() {
    return typeof this._fieldIdOrName === "number";
  }

  /**
   * Whether this Field clause has a string Field name (as opposed to an integer Field ID). This generally means the
   * Field comes from a native query.
   */
  isStringFieldName() {
    return typeof this._fieldIdOrName === "string";
  }

  field() {
    if (this.isIntegerFieldId()) {
      return (
        (this._metadata && this._metadata.field(this._fieldIdOrName)) ||
        new Field({ id: this._fieldIdOrName })
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
    });
  }

  baseDimension() {
    const unbucketedOptions = _.omit(this._options, "temporal-unit", "binning");
    return new FieldDimension(
      this._fieldIdOrName,
      unbucketedOptions,
      this._metadata,
      this._query,
    );
  }

  columnName() {
    return this.isIntegerFieldId() ? super.columnName() : this._fieldIdOrName;
  }

  displayName(...args) {
    return this.field().displayName(...args);
  }

  // TODO -- not sure if this should be different than displayName()
  subDisplayName() {
    return this.displayName();
  }

  icon() {
    return this.field().icon();
  }

  subTriggerDisplayName(): string {
    let name = this.subDisplayName();

    if (this.binningOptions()) {
      if (this.binningStrategy() === "num-bins") {
        const n = this.getBinningOption("num-bins");
        const numBinsText = ngettext(msgid`${n} bin`, `${n} bins`, n);
        name = `${name}: ${numBinsText}`;
      }
      if (this.binningStrategy() === "bin-width") {
        const binWidth = this.getBinningOption("bin-width");
        const units = this.field().isCoordinate() ? "°" : "";
        name = `${name}: ${binWidth}${units}`;
      } else {
        name = t`${name}: Auto binned`;
      }
    }
    /* if (this.defaultDimension() instanceof FieldDimension && this.defaultDimension().binningOptions()) {
     *   return "Unbinned";
     * } else {
     *   return "";
     * } */

    if (this.temporalUnit()) {
      name = t`${name} by ${this.temporalUnit()}`;
    }

    return name;
  }

  render() {
    let displayName = this.field().displayName();

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

    if (this.binningOptions()) {
      displayName = `${displayName}: ${this.binningSubTriggerDisplayName()}`;
    }

    if (this.temporalUnit()) {
      displayName = `${displayName} by ${this.temporalUnit()}`;
    }

    return displayName;
  }

  column(extra = {}) {
    const more = {};
    if (typeof this.getOption("source-field") === "number") {
      more.fk_field_id = this.getOption("source-field");
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

  // fk-> stuff
  fk() {
    if (this._fk) {
      return this._fk;
    }

    const sourceFieldIdOrName = this.getOption("source-field");
    if (!sourceFieldIdOrName) {
      return null;
    }

    this._fk = new FieldDimension(
      sourceFieldIdOrName,
      null,
      this._metadata,
      this._query,
    );
    return this._fk;
  }

  // field-literal stuff

  // datetime-field stuff

  /*
   * The temporal unit that is being used to bucket this Field, if any.
   */
  temporalUnit() {
    return this.getOption("temporal-unit");
  }

  isTemporalExtraction(): boolean {
    return this.temporalUnit() && /-of-/.test(this.temporalUnit());
  }

  isTemporalTruncation(): boolean {
    return this.temporalUnit() && !this.isExtraction();
  }

  // joined-field stuff

  joinAlias() {
    return this.getOption("join-alias");
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

  getBinningOption(option) {
    return this.binningOptions() && this.binningOptions()[option];
  }

  binningStrategy() {
    return this.getBinningOption("strategy");
  }
}

/**
 * Field Literal-based dimension, `["field-literal", field-name, base-type]`
 */
/* export class FieldLiteralDimension extends FieldDimension {
 *   columnDimension() {
 *     if (this._query) {
 *       const query = this._query.sourceQuery();
 *       const columnNames = query.columnNames();
 *       const index = _.findIndex(columnNames, name => this._args[0] === name);
 *       if (index >= 0) {
 *         return query.columnDimensions()[index];
 *       }
 *     }
 *   }
 * } */

import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";
import type Aggregation from "./queries/structured/Aggregation";
import StructuredQuery from "./queries/StructuredQuery";

const isFieldDimension = dimension => dimension instanceof FieldDimension;

/**
 * DatetimeField dimension, `["datetime-field", field-reference, datetime-unit]`
 */
/* export class DatetimeFieldDimension extends FieldDimension {
 *   static dimensions(parent: Dimension): Dimension[] {
 *     if (isFieldDimension(parent) && parent.field().isDate()) {
 *       return DATETIME_UNITS.map(
 *         unit =>
 *           new DatetimeFieldDimension(
 *             parent,
 *             [unit],
 *             this._metadata,
 *             this._query,
 *           ),
 *       );
 *     }
 *     return [];
 *   }
 *
 *   static defaultDimension(parent: Dimension): ?Dimension {
 *     if (isFieldDimension(parent) && parent.field().isDate()) {
 *       return new DatetimeFieldDimension(
 *         parent,
 *         [parent.field().getDefaultDateTimeUnit()],
 *         this._metadata,
 *         this._query,
 *       );
 *     }
 *     return null;
 *   }
 *
 *   baseDimension(): Dimension {
 *     return this._parent.baseDimension();
 *   }
 *
 *   subDisplayName(): string {
 *     return formatBucketing(this._args[0]);
 *   }
 *
 *   subTriggerDisplayName(): string {
 *     return t`by ${formatBucketing(this._args[0]).toLowerCase()}`;
 *   }
 *
 *   render() {
 *     return `${super.render()}: ${this.subDisplayName()}`;
 *   }
 * } */

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
    return new Field({
      id: this.mbql(),
      name: this.name(),
      display_name: this.displayName(),
      semantic_type: null,
      base_type: "type/Float",
      // HACK: need to thread the query through to this fake Field
      query: this._query,
      table: this._query ? this._query.table() : null,
    });
  }

  icon(): IconName {
    // TODO: eventually will need to get the type from the return type of the expression
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

/**
 * Joined field reference, `["joined-field", alias, ConcreteField]`
 */
/* export class JoinedDimension extends FieldDimension {
 *   defaultDimension(...args) {
 *     let dimension = this._parent.defaultDimension(...args);
 *     if (
 *       dimension instanceof BinnedDimension ||
 *       dimension instanceof DatetimeFieldDimension
 *     ) {
 *       // `binning-strategy` and `datetime-field` go outside of `joined-dimension`
 *       const mbql = dimension.mbql();
 *       dimension = this.parseMBQL([
 *         mbql[0],
 *         ["joined-field", this.joinAlias(), mbql[1]],
 *         ...mbql.slice(2),
 *       ]);
 *     } else if (
 *       dimension instanceof FieldIDDimension ||
 *       dimension instanceof FieldLiteralDimension
 *     ) {
 *       // `field-id` and `field-literal` goes inside of `joined-dimension`
 *       dimension = this.parseMBQL([
 *         "joined-field",
 *         this.joinAlias(),
 *         dimension.mbql(),
 *       ]);
 *     }
 *     // TODO: any others?
 *     return dimension;
 *   }
 * } */

export class TemplateTagDimension extends Dimension {
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
    return this._args[0];
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
