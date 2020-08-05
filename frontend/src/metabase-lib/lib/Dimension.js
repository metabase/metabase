import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

import { stripId, FK_SYMBOL } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";

import Field from "./metadata/Field";
import type Metadata from "./metadata/Metadata";

import type {
  ConcreteField,
  LocalFieldReference,
  ForeignFieldReference,
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
 *     - FieldIDDimension
 *     - FieldLiteralDimension
 *     - FKDimension
 *     - BinnedDimension
 *     - DatetimeFieldDimension
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
      if (!(dimension instanceof DatetimeFieldDimension)) {
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
      special_type: field.special_type,
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
 * Field based dimension, abstract class for `field-id`, `fk->`, `datetime-field`, etc
 * @abstract
 */
export class FieldDimension extends Dimension {
  field(): Field {
    if (this._parent instanceof FieldDimension) {
      return this._parent.field();
    }
    return new Field();
  }

  displayName(): string {
    return this.field().displayName();
  }

  subDisplayName(): string {
    if (this._subDisplayName) {
      return this._subTriggerDisplayName;
    } else if (this._parent) {
      // TODO Atte Keinänen 8/1/17: Is this used at all?
      // foreign key, show the field name
      return this.field().display_name;
    } else {
      // TODO Atte Keinänen 8/1/17: Is this used at all?
      return "Default";
    }
  }

  subTriggerDisplayName(): string {
    if (this.defaultDimension() instanceof BinnedDimension) {
      return "Unbinned";
    } else {
      return "";
    }
  }

  icon() {
    return this.field().icon();
  }
}

/**
 * Field ID-based dimension, `["field-id", field-id]`
 */
export class FieldIDDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ) {
    if (typeof mbql === "number") {
      // DEPRECATED: bare field id
      return new FieldIDDimension(null, [mbql], metadata, query);
    } else if (Array.isArray(mbql) && mbql[0] === "field-id") {
      return new FieldIDDimension(null, mbql.slice(1), metadata, query);
    }
    return null;
  }

  mbql(): LocalFieldReference {
    return ["field-id", this._args[0]];
  }

  field() {
    return (
      (this._metadata && this._metadata.field(this._args[0])) ||
      new Field({ id: this._args[0] })
    );
  }
}

/**
 * Field Literal-based dimension, `["field-literal", field-name, base-type]`
 */
export class FieldLiteralDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ) {
    if (Array.isArray(mbql) && mbql[0] === "field-literal") {
      return new FieldLiteralDimension(null, mbql.slice(1), metadata, query);
    }
    return null;
  }

  mbql(): LocalFieldReference {
    return ["field-literal", ...this._args];
  }

  columnDimension() {
    if (this._query) {
      const query = this._query.sourceQuery();
      const columnNames = query.columnNames();
      const index = _.findIndex(columnNames, name => this._args[0] === name);
      if (index >= 0) {
        return query.columnDimensions()[index];
      }
    }
  }

  name() {
    return this._args[0];
  }

  displayName() {
    return this.field().displayName();
  }

  field() {
    if (this._query) {
      // TODO: more efficient lookup
      const field = _.findWhere(this._query.table().fields, {
        name: this.name(),
      });
      if (field) {
        return field;
      }
    }
    return new Field({
      id: this.mbql(),
      name: this.name(),
      // NOTE: this display_name will likely be incorrect
      // if a `FieldLiteralDimension` isn't associated with a query then we don't know which table it belongs to
      display_name: this.name(),
      base_type: this._args[1],
      // HACK: need to thread the query through to this fake Field
      query: this._query,
    });
  }
}

/**
 * Foreign key-based dimension, `["fk->", ["field-id", fk-field-id], ["field-id", dest-field-id]]`
 */
export class FKDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    if (Array.isArray(mbql) && mbql[0] === "fk->") {
      // $FlowFixMe
      const fkRef: ForeignFieldReference = mbql;
      const parent = Dimension.parseMBQL(fkRef[1], metadata, query);
      return new FKDimension(parent, fkRef.slice(2), metadata, query);
    }
    return null;
  }

  static dimensions(parent: Dimension): Dimension[] {
    if (parent instanceof FieldDimension) {
      const field = parent.field();
      if (field.target && field.target.table) {
        return field.target.table.fields.map(
          field =>
            new FKDimension(
              parent,
              [field.id],
              parent._metadata,
              parent._query,
            ),
        );
      }
    }
    return [];
  }

  constructor(
    parent: ?Dimension,
    args: any[],
    metadata?: Metadata,
    query?: ?StructuredQuery,
  ): Dimension {
    super(parent, args, metadata, query);
    this._dest = this.parseMBQL(args[0]);
  }

  mbql(): ForeignFieldReference {
    return ["fk->", this._parent.mbql(), this._dest.mbql()];
  }

  field() {
    return this._dest.field();
  }

  fk() {
    return this._parent;
  }

  destination() {
    return this._dest;
  }

  column(extra = {}) {
    return {
      ...super.column(),
      fk_field_id: this.fk().field().id,
      ...extra,
    };
  }

  render() {
    return `${stripId(
      this._parent.field().displayName(),
    )} ${FK_SYMBOL} ${this.field().displayName()}`;
  }
}

import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";
import type Aggregation from "./queries/structured/Aggregation";

const isFieldDimension = dimension =>
  dimension instanceof FieldIDDimension || dimension instanceof FKDimension;

/**
 * DatetimeField dimension, `["datetime-field", field-reference, datetime-unit]`
 */
export class DatetimeFieldDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    if (Array.isArray(mbql) && mbql[0] === "datetime-field") {
      const parent = Dimension.parseMBQL(mbql[1], metadata, query);
      // DEPRECATED: ["datetime-field", id, "of", unit]
      if (mbql.length === 4) {
        return new DatetimeFieldDimension(
          parent,
          mbql.slice(3),
          metadata,
          query,
        );
      } else {
        return new DatetimeFieldDimension(
          parent,
          mbql.slice(2),
          metadata,
          query,
        );
      }
    }
    return null;
  }

  static dimensions(parent: Dimension): Dimension[] {
    if (isFieldDimension(parent) && parent.field().isDate()) {
      return DATETIME_UNITS.map(
        unit =>
          new DatetimeFieldDimension(
            parent,
            [unit],
            this._metadata,
            this._query,
          ),
      );
    }
    return [];
  }

  static defaultDimension(parent: Dimension): ?Dimension {
    if (isFieldDimension(parent) && parent.field().isDate()) {
      return new DatetimeFieldDimension(
        parent,
        [parent.field().getDefaultDateTimeUnit()],
        this._metadata,
        this._query,
      );
    }
    return null;
  }

  mbql(): DatetimeField {
    return ["datetime-field", this._parent.mbql(), this._args[0]];
  }

  baseDimension(): Dimension {
    return this._parent.baseDimension();
  }

  unit(): DatetimeUnit {
    return this._args[0];
  }

  isExtraction(): boolean {
    return /-of-/.test(this.unit());
  }
  isTruncation(): boolean {
    return !this.isExtraction();
  }

  subDisplayName(): string {
    return formatBucketing(this._args[0]);
  }

  subTriggerDisplayName(): string {
    return t`by ${formatBucketing(this._args[0]).toLowerCase()}`;
  }

  column(extra = {}) {
    return {
      ...super.column(),
      unit: this.unit(),
      ...extra,
    };
  }

  render() {
    return `${super.render()}: ${this.subDisplayName()}`;
  }
}

/**
 * Binned dimension, `["binning-strategy", field-reference, strategy, ...args]`
 */
export class BinnedDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ) {
    if (Array.isArray(mbql) && mbql[0] === "binning-strategy") {
      const parent = Dimension.parseMBQL(mbql[1], metadata, query);
      return new BinnedDimension(parent, mbql.slice(2));
    }
    return null;
  }

  static dimensions(parent: Dimension): Dimension[] {
    // Subdimensions are are provided by the backend through the dimension_options field property
    return [];
  }

  mbql() {
    return ["binning-strategy", this._parent.mbql(), ...this._args];
  }

  baseDimension(): Dimension {
    return this._parent.baseDimension();
  }

  subTriggerDisplayName(): string {
    if (this._args[0] === "num-bins") {
      const n = this._args[1];
      return ngettext(msgid`${n} bin`, `${n} bins`, n);
    } else if (this._args[0] === "bin-width") {
      const binWidth = this._args[1];
      const units = this.field().isCoordinate() ? "°" : "";
      return `${binWidth}${units}`;
    } else {
      return t`Auto binned`;
    }
  }

  render() {
    return `${super.render()}: ${this.subTriggerDisplayName()}`;
  }
}

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
      special_type: null,
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
const UNAGGREGATED_SPECIAL_TYPES = new Set([TYPE.FK, TYPE.PK]);

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
    const { special_type } = field || {};
    return new Field({
      name: aggregation.columnName(),
      display_name: aggregation.displayName(),
      base_type: aggregation.baseType(),
      // don't pass through `special_type` when aggregating these types
      ...(!UNAGGREGATED_SPECIAL_TYPES.has(special_type) && { special_type }),
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
export class JoinedDimension extends FieldDimension {
  static parseMBQL(
    mbql: ConcreteField,
    metadata?: ?Metadata,
    query?: ?StructuredQuery,
  ): ?Dimension {
    if (Array.isArray(mbql) && mbql[0] === "joined-field") {
      const parent = Dimension.parseMBQL(mbql[2], metadata, query);
      return new JoinedDimension(parent, [mbql[1]], metadata, query);
    }
    return null;
  }

  subDisplayName(): string {
    return this._parent.subDisplayName();
  }

  subTriggerDisplayName() {
    return this._parent.subTriggerDisplayName();
  }

  defaultDimension(...args) {
    let dimension = this._parent.defaultDimension(...args);
    if (
      dimension instanceof BinnedDimension ||
      dimension instanceof DatetimeFieldDimension
    ) {
      // `binning-strategy` and `datetime-field` go outside of `joined-dimension`
      const mbql = dimension.mbql();
      dimension = this.parseMBQL([
        mbql[0],
        ["joined-field", this.joinAlias(), mbql[1]],
        ...mbql.slice(2),
      ]);
    } else if (
      dimension instanceof FieldIDDimension ||
      dimension instanceof FieldLiteralDimension
    ) {
      // `field-id` and `field-literal` goes inside of `joined-dimension`
      dimension = this.parseMBQL([
        "joined-field",
        this.joinAlias(),
        dimension.mbql(),
      ]);
    }
    // TODO: any others?
    return dimension;
  }

  joinAlias() {
    return this._args[0];
  }

  join() {
    return _.findWhere(this._query && this._query.joins(), {
      alias: this.joinAlias(),
    });
  }

  mbql(): ForeignFieldReference {
    return ["joined-field", this._args[0], this._parent.mbql()];
  }

  render() {
    return `${this.joinAlias()} ${FK_SYMBOL} ${super.render()}`;
  }
}

export class TemplateTagDimension extends FieldDimension {
  dimension() {
    if (this._query) {
      const tag = this._query.templateTagsMap()[this.tagName()];
      if (tag && tag.type === "dimension") {
        return this.parseMBQL(tag.dimension);
      }
    }
    return null;
  }

  field() {
    const dimension = this.dimension();
    return dimension ? dimension.field() : super.field();
  }

  tagName() {
    return this._args[0];
  }

  mbql() {
    return ["template-tag", this.tagName()];
  }
}

const DIMENSION_TYPES: typeof Dimension[] = [
  FieldIDDimension,
  FieldLiteralDimension,
  FKDimension,
  DatetimeFieldDimension,
  ExpressionDimension,
  BinnedDimension,
  AggregationDimension,
  JoinedDimension,
];
