// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";
import { merge } from "icepick";
import { stripId, FK_SYMBOL } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";
import { TemplateTagVariable } from "metabase-lib/lib/Variable";
import Field from "metabase-lib/lib/metadata/Field";
import {
  AggregationOperator,
  FilterOperator,
  Metadata,
  Query,
} from "metabase-lib/lib/metadata/Metadata";
import {
  Field as AbstractField,
  ConcreteField,
  LocalFieldReference,
  ExpressionReference,
  DatetimeUnit,
} from "metabase-types/types/Query";
import { VariableTarget } from "metabase-types/types/Parameter";
import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/lib/ValidationError";
import { IconName } from "metabase-types/types";
import { getFieldValues, getRemappings } from "metabase/lib/query/field";
import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";
import { getQuestionIdFromVirtualTableId } from "metabase/lib/saved-questions";
import Aggregation from "metabase-lib/lib/queries/structured/Aggregation";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { infer, MONOTYPE } from "metabase/lib/expressions/typeinferencer";
import { isa } from "cljs/metabase.types";

/**
 * A dimension option returned by the query_metadata API
 */
type DimensionOption = {
  mbql: any;
  name?: string;
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
    mbql: ConcreteField | VariableTarget,
    metadata?: Metadata,
    query?: StructuredQuery | NativeQuery | null | undefined,
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

  isExpression(): boolean {
    return isExpressionDimension(this);
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

  mbql(): AbstractField | null | undefined {
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

  static parseMBQL(
    mbql,
    metadata = null,
    query = null,
  ): FieldDimension | null | undefined {
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
  static parseMBQLOrWarn(
    mbql,
    metadata = null,
    query = null,
  ): FieldDimension | null | undefined {
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

  constructor(
    fieldIdOrName,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(
      null,
      [fieldIdOrName, options],
      metadata,
      query,
      Object.freeze(Dimension.normalizeOptions(options)),
    );
    this._fieldIdOrName = fieldIdOrName;

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

  _createField(fieldInfo, { hydrate = false } = {}): Field {
    const field = new Field({
      ...fieldInfo,
      metadata: this._metadata,
      query: this._query,
    });

    // This is normally done when calculating metadata,
    // but since we're merging plain objects without these fields,
    // we need to repeat the hydration again.
    // We should definitely move it out of there
    if (hydrate) {
      field.table =
        this.query()?.table() ?? this._metadata.table(field.table_id);
      field.table_id = field.table?.id;

      if (field.isFK()) {
        field.target = this._metadata.field(field.fk_target_field_id);
      }

      if (field.name_field != null) {
        field.field_name = this._metadata.field(field.name_field);
      } else if (field.table && field.isPK()) {
        field.field_name = _.find(field.table.fields, f => f.isEntityName());
      }

      field.values = getFieldValues(field);
      field.remappings = new Map(getRemappings(field));
    }

    return field;
  }

  _getIdentifierProp() {
    return this.isIntegerFieldId() ? "id" : "name";
  }

  _getTrustedFieldCachedOnInstance() {
    if (
      this._fieldInstance &&
      this._fieldInstance._comesFromEndpoint === true
    ) {
      return this._fieldInstance;
    }
  }

  _getFieldMetadataFromSavedQuestion() {
    const identifierProp = this._getIdentifierProp();
    const questionAssociatedWithDimension = this.query()?.question();
    if (questionAssociatedWithDimension?.isSaved()) {
      const question = this.query()?.question();
      const field = _.findWhere(question.getResultMetadata(), {
        [identifierProp]: this.fieldIdOrName(),
      });

      return field;
    }
  }

  _getFieldMetadataFromNestedCard() {
    const identifierProp = this._getIdentifierProp();
    const virtualTableCardId = getQuestionIdFromVirtualTableId(
      this.query()?.sourceTableId?.(),
    );
    if (virtualTableCardId != null) {
      const card = this._metadata?.card(virtualTableCardId);
      const field = card
        ? _.findWhere(card.result_metadata, {
            [identifierProp]: this.fieldIdOrName(),
          })
        : undefined;

      return field;
    }
  }

  _getFieldMetadataFromQueryTable() {
    const identifierProp = this._getIdentifierProp();
    const table = this.query()?.table();
    return _.findWhere(table?.fields, {
      [identifierProp]: this.fieldIdOrName(),
    });
  }

  _combineFieldWithExtraMetadata(field: Field | undefined, fieldMetadata) {
    if (field) {
      if (!fieldMetadata || field === fieldMetadata) {
        return field;
      }

      const fieldObject = merge(
        field instanceof Field ? field.getPlainObject() : field,
        fieldMetadata instanceof Field
          ? fieldMetadata.getPlainObject()
          : fieldMetadata,
      );
      return this._createField(fieldObject, { hydrate: true });
    }

    if (fieldMetadata) {
      if (fieldMetadata instanceof Field) {
        return fieldMetadata;
      }

      return this._createField(fieldMetadata);
    }
  }

  field(): Field {
    /*
      1. If a Field is cached on the FieldDimension instance, we can shortwire this method and
         return the cached Field.
      2. When the associated card is saved, we can always rely on its result_metadata array because it
         will be populated with relevant Field metadata from the BE.
      3. Otherwise, when the query is based on another card, check the result_metadata of the nested card.
         We can't always rely on this.query().table() when a query with a nested card is unsaved
         because the Table instance may contain field objects that _should_ have local, overriding metadata
         (e.g. a custom description) but that have been clobbered by the Field instances from the real Table
         that the nested card is based on.
      4. Fallback to grabbing the Field off of the query's table, which may be identical to the Field
         returned from the Metadata object.
    */
    const cachedField = this._getTrustedFieldCachedOnInstance();
    if (cachedField) {
      return cachedField;
    }

    const fieldMetadata =
      this._getFieldMetadataFromSavedQuestion() ||
      this._getFieldMetadataFromNestedCard() ||
      this._getFieldMetadataFromQueryTable();

    // The `fieldMetadata` object may have metadata that overrides the regular field object
    // (e.g. a custom field display name or description on a model)
    const field = this._metadata?.field(this.fieldIdOrName());
    const combinedField = this._combineFieldWithExtraMetadata(
      field,
      fieldMetadata,
    );

    if (combinedField) {
      return combinedField;
    }

    // Despite being unable to find a field, we _might_ still have enough data to know a few things about it.
    // For example, if we have an mbql field reference, it might contain a `base-type`
    return this._createField({
      id: this.isIntegerFieldId() ? this.fieldIdOrName() : this.mbql(),
      name: this.isStringFieldName() && this.fieldIdOrName(),
      // NOTE: this display_name will likely be incorrect
      // if a `FieldDimension` isn't associated with a query then we don't know which table it belongs to
      display_name: this._fieldIdOrName,
      base_type: this.getOption("base-type"),
    });
  }

  tableId() {
    return this.field()?.table?.id;
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
   * Return a copy of this FieldDimension that includes the specified `options`.
   */
  withOptions(options: any): FieldDimension {
    // optimization : if options is empty return self as-is
    if (!options || !Object.entries(options).length) {
      return this;
    }

    return new FieldDimension(
      this._fieldIdOrName,
      { ...this._options, ...options },
      this._metadata,
      this._query,
      this._fieldInstance && {
        _fieldInstance: this._fieldInstance,
      },
    );
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

  icon() {
    return this.field().icon();
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
    if (field.target?.table?.fields) {
      const fkDimensions = field.target.table.fields.map(
        field =>
          new FieldDimension(
            field.id,
            {
              "source-field": this._fieldIdOrName,
            },
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
    let dimension = option.mbql
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

    // Field literal's sub-dimensions sometimes don't have a specified base-type
    // This can break a query, so here we need to ensure it mirrors the parent dimension
    if (this.getOption("base-type") && !dimension.getOption("base-type")) {
      dimension = dimension.withOption(
        "base-type",
        this.getOption("base-type"),
      );
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

  render(): string {
    let displayName = this.displayName();

    if (this.fk()) {
      const fkDisplayName =
        this.fk() && stripId(this.fk().field().displayName());
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

    return { ...super.column(), ...more, ...extra };
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

  join() {
    return this.joinAlias()
      ? _.findWhere(this._query && this._query.joins(), {
          alias: this.joinAlias(),
        })
      : null;
  }
}

const isFieldDimension = dimension => dimension instanceof FieldDimension;

/**
 * Expression reference, `["expression", expression-name]`
 */
export class ExpressionDimension extends Dimension {
  _expressionName: ExpressionName;

  /**
   * Whether `clause` is an array, and a valid `:expression` clause
   */
  static isExpressionClause(clause): boolean {
    return (
      Array.isArray(clause) && clause.length >= 2 && clause[0] === "expression"
    );
  }

  static parseMBQL(
    mbql: any,
    metadata?: Metadata | null | undefined,
    query?: StructuredQuery | null | undefined,
  ): Dimension | null | undefined {
    if (ExpressionDimension.isExpressionClause(mbql)) {
      const [expressionName, options] = mbql.slice(1);
      return new ExpressionDimension(expressionName, options, metadata, query);
    }
  }

  constructor(
    expressionName,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(
      null,
      [expressionName, options],
      metadata,
      query,
      Object.freeze(Dimension.normalizeOptions(options)),
    );
    this._expressionName = expressionName;

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  isEqual(somethingElse) {
    if (isExpressionDimension(somethingElse)) {
      return (
        somethingElse._expressionName === this._expressionName &&
        _.isEqual(somethingElse._options, this._options)
      );
    }

    if (ExpressionDimension.isExpressionClause(somethingElse)) {
      const dimension = ExpressionDimension.parseMBQL(
        somethingElse,
        this._metadata,
        this._query,
      );
      return dimension ? this.isEqual(dimension) : false;
    }

    return false;
  }

  mbql(): ExpressionReference {
    return ["expression", this._expressionName, this._options];
  }

  name() {
    return this._expressionName;
  }

  displayName(): string {
    return this._expressionName;
  }

  columnName() {
    return this._expressionName;
  }

  _createField(fieldInfo): Field {
    return new Field({
      ...fieldInfo,
      metadata: this._metadata,
      query: this._query,
    });
  }

  field() {
    const query = this._query;
    const table = query ? query.table() : null;

    // fallback
    let type = MONOTYPE.Number;
    let semantic_type = null;

    if (query) {
      const datasetQuery = query.query();
      const expressions = datasetQuery?.expressions ?? {};
      const expr = expressions[this.name()];

      const field = mbql => {
        const dimension = Dimension.parseMBQL(
          mbql,
          this._metadata,
          this._query,
        );
        return dimension?.field();
      };

      type = infer(expr, mbql => field(mbql)?.base_type);
      semantic_type = infer(expr, mbql => field(mbql)?.semantic_type);
    } else {
      type = infer(this._expressionName);
    }

    let base_type = type;
    if (!type.startsWith("type/")) {
      switch (type) {
        case MONOTYPE.String:
          base_type = "type/Text";
          break;

        case MONOTYPE.Boolean:
          base_type = "type/Boolean";
          break;

        // fallback
        default:
          base_type = "type/Float";
          break;
      }
      semantic_type = base_type;
    }

    // if a dimension has access to a question with result metadata,
    // we try to find the field using the metadata directly,
    // so that we don't have to try to infer field metadata from the expression
    const resultMetadata = query?.question()?.getResultMetadata?.();
    if (resultMetadata) {
      const fieldMetadata = _.findWhere(resultMetadata, {
        name: this.name(),
      });
      if (fieldMetadata) {
        return this._createField(fieldMetadata);
      }
    }

    const subsOptions = getOptions(semantic_type ? semantic_type : base_type);
    const dimension_options =
      subsOptions && Array.isArray(subsOptions)
        ? subsOptions.map(({ name, options }) => {
            return {
              name,
              type: base_type,
              mbql: ["expression", null, options],
            };
          })
        : null;

    return new Field({
      id: this.mbql(),
      name: this.name(),
      display_name: this.displayName(),
      base_type,
      semantic_type,
      query,
      table,
      dimension_options,
    });
  }

  icon(): IconName {
    const field = this.field();
    return field ? field.icon() : "unknown";
  }

  _dimensionForOption(option): ExpressionDimension {
    const dimension = option.mbql
      ? ExpressionDimension.parseMBQL(option.mbql, this._metadata, this._query)
      : this;

    const additionalProperties = {
      _expressionName: this._expressionName,
    };

    if (option.name) {
      additionalProperties._subDisplayName = option.name;
      additionalProperties._subTriggerDisplayName = option.name;
    }

    return new ExpressionDimension(
      dimension._expressionName,
      dimension._options,
      this._metadata,
      this._query,
      additionalProperties,
    );
  }

  /**
   * Return a copy of this ExpressionDimension that excludes `options`.
   */
  withoutOptions(...options: string[]): ExpressionDimension {
    // optimization: if we don't have any options, we can return ourself as-is
    if (!this._options) {
      return this;
    }

    return new ExpressionDimension(
      this._expressionName,
      _.omit(this._options, ...options),
      this._metadata,
      this._query,
    );
  }

  /**
   * Return a copy of this ExpressionDimension that includes the specified `options`.
   */
  withOptions(options: any): ExpressionDimension {
    // optimization : if options is empty return self as-is
    if (!options || !Object.entries(options).length) {
      return this;
    }

    return new ExpressionDimension(
      this._expressionName,
      { ...this._options, ...options },
      this._metadata,
      this._query,
    );
  }

  render(): string {
    let displayName = this.displayName();

    if (this.temporalUnit()) {
      displayName = `${displayName}: ${formatBucketing(this.temporalUnit())}`;
    }

    if (this.binningOptions()) {
      displayName = `${displayName}: ${this.describeBinning()}`;
    }

    return displayName;
  }
}

const isExpressionDimension = dimension =>
  dimension instanceof ExpressionDimension;

// These types aren't aggregated. e.g. if you take the distinct count of a FK
// column, you now have a normal integer and should see relevant filters for
// that type.
const UNAGGREGATED_SEMANTIC_TYPES = new Set([TYPE.FK, TYPE.PK]);

/**
 * Aggregation reference, `["aggregation", aggregation-index]`
 */
export class AggregationDimension extends Dimension {
  _aggregationIndex: number;

  static parseMBQL(
    mbql: any,
    metadata?: Metadata | null | undefined,
    query?: StructuredQuery | null | undefined,
  ): Dimension | null | undefined {
    if (Array.isArray(mbql) && mbql[0] === "aggregation") {
      const [aggregationIndex, options] = mbql.slice(1);
      return new AggregationDimension(
        aggregationIndex,
        options,
        metadata,
        query,
      );
    }
  }

  constructor(
    aggregationIndex,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(
      null,
      [aggregationIndex, options],
      metadata,
      query,
      Object.freeze(Dimension.normalizeOptions(options)),
    );
    this._aggregationIndex = aggregationIndex;

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  aggregationIndex(): number {
    return this._aggregationIndex;
  }

  column(extra = {}) {
    return { ...super.column(), source: "aggregation", ...extra };
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
      ...(!UNAGGREGATED_SEMANTIC_TYPES.has(semantic_type) && {
        semantic_type,
      }),
      query: this._query,
      metadata: this._metadata,
    });
  }

  /**
   * Raw aggregation
   */
  _aggregation(): Aggregation {
    return (
      this._query &&
      this._query.aggregations &&
      this._query.aggregations()[this.aggregationIndex()]
    );
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
    return ["aggregation", this._aggregationIndex, this._options];
  }

  icon() {
    return "int";
  }
}
export class TemplateTagDimension extends FieldDimension {
  constructor(tagName: string, metadata: Metadata, query: NativeQuery) {
    super(null, null, metadata, query, {
      _tagName: tagName,
    });
  }

  static parseMBQL(
    mbql: VariableTarget,
    metadata: Metadata = null,
    query: NativeQuery = null,
  ): FieldDimension | null | undefined {
    return TemplateTagDimension.isTemplateTagClause(mbql)
      ? Object.freeze(new TemplateTagDimension(mbql[1], metadata, query))
      : null;
  }

  static isTemplateTagClause(clause) {
    return Array.isArray(clause) && clause[0] === "template-tag";
  }

  validateTemplateTag(): ValidationError | null {
    const tag = this.tag();
    if (!tag) {
      return new ValidationError(t`Invalid template tag "${this.tagName()}"`);
    }

    if (this.isDimensionType() && tag.dimension == null) {
      return new ValidationError(
        t`The variable "${this.tagName()}" needs to be mapped to a field.`,
        VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
      );
    }

    return null;
  }

  isValidDimensionType() {
    const maybeErrors = this.validateTemplateTag();
    return this.isDimensionType() && maybeErrors === null;
  }

  isDimensionType() {
    const maybeTag = this.tag();
    return maybeTag?.type === "dimension";
  }

  isVariableType() {
    const maybeTag = this.tag();
    return ["text", "number", "date"].includes(maybeTag?.type);
  }

  dimension() {
    if (this.isValidDimensionType()) {
      const tag = this.tag();
      return Dimension.parseMBQL(tag.dimension, this._metadata, this._query);
    }

    return null;
  }

  variable() {
    if (this.isVariableType()) {
      const tag = this.tag();
      return new TemplateTagVariable([tag.name], this._metadata, this._query);
    }

    return null;
  }

  tag() {
    const templateTagMap = this._query?.templateTagsMap() ?? {};
    return templateTagMap[this.tagName()];
  }

  field() {
    if (this.isValidDimensionType()) {
      return this.dimension().field();
    }

    return null;
  }

  name() {
    return this.isValidDimensionType() ? this.field().name : this.tagName();
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

  icon() {
    if (this.isValidDimensionType()) {
      return this.dimension().icon();
    } else if (this.isVariableType()) {
      return this.variable().icon();
    }

    return "label";
  }
}
const DIMENSION_TYPES: typeof Dimension[] = [
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
  TemplateTagDimension,
];

const NUMBER_SUBDIMENSIONS = [
  {
    name: t`Auto bin`,
    options: {
      binning: {
        strategy: "default",
      },
    },
  },
  {
    name: t`10 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 10,
      },
    },
  },
  {
    name: t`50 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 50,
      },
    },
  },
  {
    name: t`100 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 100,
      },
    },
  },
  {
    name: t`Don't bin`,
    options: null,
  },
];

const DATETIME_SUBDIMENSIONS = [
  {
    name: t`Minute`,
    options: {
      "temporal-unit": "minute",
    },
  },
  {
    name: t`Hour`,
    options: {
      "temporal-unit": "hour",
    },
  },
  {
    name: t`Day`,
    options: {
      "temporal-unit": "day",
    },
  },
  {
    name: t`Week`,
    options: {
      "temporal-unit": "week",
    },
  },
  {
    name: t`Month`,
    options: {
      "temporal-unit": "month",
    },
  },
  {
    name: t`Quarter`,
    options: {
      "temporal-unit": "quarter",
    },
  },
  {
    name: t`Year`,
    options: {
      "temporal-unit": "year",
    },
  },
  {
    name: t`Minute of Hour`,
    options: {
      "temporal-unit": "minute-of-hour",
    },
  },
  {
    name: t`Hour of Day`,
    options: {
      "temporal-unit": "hour-of-day",
    },
  },
  {
    name: t`Day of Week`,
    options: {
      "temporal-unit": "day-of-week",
    },
  },
  {
    name: t`Day of Month`,
    options: {
      "temporal-unit": "day-of-month",
    },
  },
  {
    name: t`Day of Year`,
    options: {
      "temporal-unit": "day-of-year",
    },
  },
  {
    name: t`Week of Year`,
    options: {
      "temporal-unit": "week-of-year",
    },
  },
  {
    name: t`Month of Year`,
    options: {
      "temporal-unit": "month-of-year",
    },
  },
  {
    name: t`Quarter of Year`,
    options: {
      "temporal-unit": "quarter-of-year",
    },
  },
];

const COORDINATE_SUBDIMENSIONS = [
  {
    name: t`Bin every 0.1 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 0.1,
      },
    },
  },
  {
    name: t`Bin every 1 degree`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 1,
      },
    },
  },
  {
    name: t`Bin every 10 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 10,
      },
    },
  },
  {
    name: t`Bin every 20 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 20,
      },
    },
  },
  {
    name: t`Don't bin`,
    options: null,
  },
];

function getOptions(type) {
  if (isa(type, "type/Coordinate")) {
    return COORDINATE_SUBDIMENSIONS;
  } else if (isa(type, "type/Number")) {
    return NUMBER_SUBDIMENSIONS;
  } else if (isa(type, "type/DateTime")) {
    return DATETIME_SUBDIMENSIONS;
  }

  return null;
}
