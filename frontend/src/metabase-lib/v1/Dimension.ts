// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t } from "ttag";
import _ from "underscore";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/v1/ValidationError";
import Field from "metabase-lib/v1/metadata/Field";
import type { Metadata, Query } from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import { DATETIME_UNITS } from "metabase-lib/v1/queries/utils/query-time";
import {
  getBaseDimensionReference,
  isFieldReference,
  isTemplateTagReference,
  normalizeReferenceOptions,
} from "metabase-lib/v1/references";
import TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type {
  ConcreteFieldReference,
  FieldReference,
  LocalFieldReference,
  VariableTarget,
} from "metabase-types/api";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
   * Parses an MBQL expression into an appropriate Dimension subclass, if possible.
   * Metadata should be provided if you intend to use the display name or render methods.
   */
  static parseMBQL(
    mbql: FieldReference | VariableTarget,
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

  parseMBQL(mbql: ConcreteFieldReference): Dimension | null | undefined {
    return Dimension.parseMBQL(mbql, this._metadata, this._query);
  }

  /**
   * Returns true if these two dimensions are identical to one another.
   */
  static isEqual(
    a: Dimension | null | undefined | ConcreteFieldReference,
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
  static dimensions(_parent: Dimension): Dimension[] {
    return [];
  }

  /**
   * Returns "sub-dimensions" of this dimension.
   * @abstract
   */
  // TODO Atte Keinänen 5/21/17: Rename either this or the static method with the same name
  // Also making it clear in the method name that we're working with sub-dimensions would be good
  dimensions(DimensionTypes?: (typeof Dimension)[]): Dimension[] {
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
   * Internal method gets a Dimension from a DimensionOption
   */
  _dimensionForOption(option: DimensionOption) {
    // fill in the parent field ref
    const fieldRef = getBaseDimensionReference(this.mbql());
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
   * Is this dimension identical to another dimension or MBQL clause
   */
  isEqual(
    other: Dimension | null | undefined | ConcreteFieldReference,
  ): boolean {
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

  isExpression(): boolean {
    return false;
  }

  /**
   * The underlying field for this dimension
   */
  field(): Field {
    return new Field();
  }

  /**
   * The display name of this dimension, e.x. the field's display_name
   * @abstract
   */
  displayName(..._args: unknown[]): string {
    return "";
  }

  legacyQuery(
    _opts: { useStructuredQuery: true } = {},
  ): StructuredQuery | null | undefined {
    return this._query;
  }

  setQuery(_query: StructuredQuery): Dimension {
    return this;
  }

  getOptions() {
    return this._options;
  }

  /**
   * Get an option from the field options map, if there is one.
   */
  getOption(k: string): any {
    const options = this.getOptions();
    return options?.[k];
  }

  /*
   * The temporal unit that is being used to bucket this Field, if any.
   */
  temporalUnit() {
    return this.getOption("temporal-unit");
  }

  // binning-strategy stuff
  _binningOptions() {
    return this.getOption("binning");
  }

  _getBinningOption(option) {
    return this._binningOptions() && this._binningOptions()[option];
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
  _withOptions(_options: any): Dimension {
    return this;
  }

  /**
   * Return a copy of this Dimension with option `key` set to `value`.
   */
  withOption(key: string, value: any): Dimension {
    return this._withOptions({
      [key]: value,
    });
  }

  /**
   * Return a copy of this Dimension, bucketed by the specified temporal unit.
   */
  withTemporalUnit(unit: string): Dimension {
    return this._withOptions({
      "temporal-unit": unit,
    });
  }

  /**
   * Return a copy of this Dimension with join alias set to `newAlias`.
   */
  withJoinAlias(newAlias) {
    return this._withOptions({
      "join-alias": newAlias,
    });
  }

  /**
   * Return a copy of this Dimension with a replacement source field.
   */
  withSourceField(sourceField) {
    return this._withOptions({
      "source-field": sourceField,
    });
  }

  mbql(): FieldReference | null | undefined {
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
    mbql,
    metadata = null,
    query = null,
  ): FieldDimension | null | undefined {
    if (isFieldReference(mbql)) {
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
      Object.freeze(normalizeReferenceOptions(options)),
    );
    this._fieldIdOrName = fieldIdOrName;

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  setQuery(query: StructuredQuery): FieldDimension {
    return new FieldDimension(
      this._fieldIdOrName,
      this._options,
      this._metadata,
      query,
      {
        _fieldInstance: this._fieldInstance,
        _subDisplayName: this._subDisplayName,
        _subTriggerDisplayName: this._subTriggerDisplayName,
      },
    );
  }

  isEqual(somethingElse) {
    if (isFieldDimension(somethingElse)) {
      return (
        somethingElse._fieldIdOrName === this._fieldIdOrName &&
        _.isEqual(somethingElse._options, this._options)
      );
    }

    // this should be considered equivalent to an equivalent MBQL clause
    if (isFieldReference(somethingElse)) {
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

  _createField(fieldInfo): Field {
    const field = new Field({
      ...fieldInfo,
      metadata: this._metadata,
      query: this._query,
    });

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

  _findMatchingQueryField() {
    const identifierProp = this._getIdentifierProp();
    const fieldIdentifier = this.fieldIdOrName();
    if (this._query) {
      const queryTableFields = this._query.table?.()?.fields;
      return _.findWhere(queryTableFields, {
        [identifierProp]: fieldIdentifier,
      });
    }
  }

  _createFallbackField(): Field {
    return this._createField({
      id: this.isIntegerFieldId() ? this.fieldIdOrName() : this.mbql(),
      field_ref: this.mbql(),
      name: this.isStringFieldName() && this.fieldIdOrName(),
      display_name: this.fieldIdOrName(),
      base_type: this.getOption("base-type"),
    });
  }

  field(): Field {
    try {
      // If a Field is cached on the FieldDimension instance, we can shortwire this method and
      // return the cached Field.
      const locallyCachedField = this._getTrustedFieldCachedOnInstance();
      if (locallyCachedField) {
        return locallyCachedField;
      }

      // Prioritize pulling a `field` from the Dimenion's associated query (if one exists)
      // because it might have locally overriding metadata on it.
      const fieldFromQuery = this._findMatchingQueryField();
      if (fieldFromQuery) {
        return fieldFromQuery;
      }

      const maybeTableId = this._query?.table()?.id;
      const fieldFromGlobalState =
        this._metadata?.field(this.fieldIdOrName(), maybeTableId) ||
        this._metadata?.field(this.fieldIdOrName());
      if (fieldFromGlobalState) {
        return fieldFromGlobalState;
      }

      // Hitting this return statement means that there is a bug.
      // This primarily serves as a way to guarantee that this function returns a Field to avoid errors in dependent code.
      // Despite being unable to find a field, we _might_ still have enough data to know a few things about it.
      // For example, if we have an mbql field reference, it might contain a `base-type`
      return this._createFallbackField();
    } catch (e) {
      console.warn("FieldDimension.field()", this.mbql(), e);
      return null;
    }
  }

  tableId() {
    return this.field()?.table?.id;
  }

  /**
   * Return a copy of this FieldDimension that includes the specified `options`.
   */
  _withOptions(options: any): FieldDimension {
    // optimization : if options is empty return self as-is
    if (!options || !Object.entries(options).length) {
      return this;
    }

    return new FieldDimension(
      this._fieldIdOrName,
      { ...this._options, ...options },
      this._metadata,
      this._query,
      {
        _fieldInstance: this._fieldInstance,
        _subDisplayName: this._subDisplayName,
        _subTriggerDisplayName: this._subTriggerDisplayName,
      },
    );
  }

  displayName(...args) {
    return this.field().displayName(...args);
  }

  icon() {
    return this.field().icon();
  }

  dimensions(DimensionTypes?: (typeof Dimension)[]): FieldDimension[] {
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

  join() {
    return null;
  }
}

const isFieldDimension = dimension => dimension instanceof FieldDimension;

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
    return isTemplateTagReference(mbql)
      ? Object.freeze(new TemplateTagDimension(mbql[1], metadata, query))
      : null;
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
    try {
      if (this.isValidDimensionType()) {
        return this.dimension().field();
      }
      return null;
    } catch (e) {
      console.warn("TemplateTagDimension.field()", this.mbql(), e);
      return null;
    }
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

  mbql(): VariableTarget {
    return ["template-tag", this.tagName()];
  }
}

const DIMENSION_TYPES: (typeof Dimension)[] = [
  FieldDimension,
  TemplateTagDimension,
];
