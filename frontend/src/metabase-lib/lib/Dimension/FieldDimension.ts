// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { merge } from "icepick";

import { stripId, FK_SYMBOL } from "metabase/lib/formatting";
import { LocalFieldReference } from "metabase-types/types/Query";
import { getFieldValues, getRemappings } from "metabase/lib/query/field";
import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";

import Field from "../metadata/Field";
import Dimension from "./Dimension";

export default class FieldDimension extends Dimension {
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
      field.table = this._metadata.table(field.table_id);

      if (field.isFK()) {
        field.target = this._metadata.field(field.fk_target_field_id);
      }

      if (field.name_field != null) {
        field.field_name = meta.field(field.name_field);
      } else if (field.table && field.isPK()) {
        field.field_name = _.find(field.table.fields, f => f.isEntityName());
      }

      field.values = getFieldValues(field);
      field.remappings = new Map(getRemappings(field));
    }

    return field;
  }

  field(): Field {
    if (
      this._fieldInstance &&
      this._fieldInstance._comesFromEndpoint === true
    ) {
      return this._fieldInstance;
    }

    const question = this.query()?.question();
    const lookupField = this.isIntegerFieldId() ? "id" : "name";
    const fieldMetadata = question
      ? _.findWhere(question.getResultMetadata(), {
          [lookupField]: this.fieldIdOrName(),
        })
      : null;

    // Field result metadata can be overwritten for models,
    // so we need to merge regular field object with the model overwrites
    const shouldMergeFieldResultMetadata = question?.isDataset();

    if (this.isIntegerFieldId()) {
      const field = this._metadata?.field(this.fieldIdOrName());

      if (field) {
        if (!fieldMetadata || !shouldMergeFieldResultMetadata) {
          return field;
        }
        const fieldObject = merge(
          field instanceof Field ? field.getPlainObject() : field,
          fieldMetadata,
        );
        return this._createField(fieldObject, { hydrate: true });
      }

      if (fieldMetadata) {
        return this._createField(fieldMetadata);
      }

      return this._createField({ id: this._fieldIdOrName });
    }

    // look for a "virtual" field on the query's table or question
    // for example, fields from a question based on a nested question have fields
    // that show up in a card's `result_metadata`
    if (this.query()) {
      const table = this.query().table();

      if (table != null) {
        const field = _.findWhere(table.fields, {
          name: this.fieldIdOrName(),
        });

        if (field) {
          if (!fieldMetadata || !shouldMergeFieldResultMetadata) {
            return field;
          }
          const fieldObject = merge(
            field instanceof Field ? field.getPlainObject() : field,
            fieldMetadata,
          );
          return this._createField(fieldObject, { hydrate: true });
        }
      }

      if (fieldMetadata) {
        return this._createField(fieldMetadata);
      }
    }

    // despite being unable to find a field, we _might_ still have enough data to know a few things about it
    // for example, if we have an mbql field reference, it might contain a `base-type`
    return this._createField({
      id: this.mbql(),
      name: this._fieldIdOrName,
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
    if (field.target && field.target.table && field.target.table.fields) {
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

  isFieldDimension() {
    return true;
  }
}

const isFieldDimension = (dimension: any): dimension is FieldDimension =>
  dimension instanceof FieldDimension;
