/* @flow weak */

/**
 * Represents a structured MBQL query.
 */

import * as Q from "metabase/lib/query/query";
import Q_deprecated, {
  AggregationClause,
  NamedClause,
} from "metabase/lib/query";
import { format as formatExpression } from "metabase/lib/expressions/formatter";
import { getAggregator } from "metabase/lib/schema_metadata";

import _ from "underscore";
import { chain, assoc, updateIn } from "icepick";

import type {
  StructuredQuery as StructuredQueryObject,
  Aggregation,
  Breakout,
  Filter,
  LimitClause,
  OrderBy,
} from "metabase/meta/types/Query";
import type {
  DatasetQuery,
  StructuredDatasetQuery,
} from "metabase/meta/types/Card";
import type {
  TableMetadata,
  DimensionOptions,
} from "metabase/meta/types/Metadata";

import Dimension, {
  FKDimension,
  ExpressionDimension,
  AggregationDimension,
} from "metabase-lib/lib/Dimension";

import type Table from "../metadata/Table";
import type Segment from "../metadata/Segment";
import type { DatabaseEngine, DatabaseId } from "metabase/meta/types/Database";
import type Database from "../metadata/Database";
import type Question from "../Question";
import type { TableId } from "metabase/meta/types/Table";
import AtomicQuery from "./AtomicQuery";
import AggregationWrapper from "./Aggregation";
import AggregationOption from "metabase-lib/lib/metadata/AggregationOption";
import Utils from "metabase/lib/utils";

import { isSegmentFilter } from "metabase/lib/query/filter";

export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    source_table: null,
  },
};

/**
 * A wrapper around an MBQL (`query` type @type {DatasetQuery}) object
 */
export default class StructuredQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery): boolean {
    return datasetQuery.type === STRUCTURED_QUERY_TEMPLATE.type;
  }

  // For Flow type completion
  _structuredDatasetQuery: StructuredDatasetQuery;

  /**
   * Creates a new StructuredQuery based on the provided DatasetQuery object
   */
  constructor(
    question: Question,
    datasetQuery: DatasetQuery = STRUCTURED_QUERY_TEMPLATE,
  ) {
    super(question, datasetQuery);

    this._structuredDatasetQuery = (datasetQuery: StructuredDatasetQuery);
  }

  static newStucturedQuery({
    question,
    databaseId,
    tableId,
  }: {
    question: Question,
    databaseId?: DatabaseId,
    tableId?: TableId,
  }) {
    const datasetQuery = {
      ...STRUCTURED_QUERY_TEMPLATE,
      database: databaseId || null,
      query: {
        source_table: tableId || null,
      },
    };

    return new StructuredQuery(question, datasetQuery);
  }

  /* Query superclass methods */

  /**
   * @returns true if this is new query that hasn't been modified yet.
   */
  isEmpty() {
    return !this.databaseId();
  }

  /**
   * @returns true if this query is in a state where it can be run.
   */
  canRun() {
    return Q_deprecated.canRun(this.query());
  }

  /**
   * @returns true if this query is in a state where it can be edited. Must have database and table set, and metadata for the table loaded.
   */
  isEditable(): boolean {
    return !!this.tableMetadata();
  }

  /* AtomicQuery superclass methods */

  /**
   * @returns all tables in the currently selected database that can be used.
   */
  tables(): ?(Table[]) {
    const database = this.database();
    return (database && database.tables) || null;
  }

  /**
   * @returns the currently selected database ID, if any is selected.
   */
  databaseId(): ?DatabaseId {
    // same for both structured and native
    return this._structuredDatasetQuery.database;
  }

  /**
   * @returns the currently selected database metadata, if a database is selected and loaded.
   */
  database(): ?Database {
    const databaseId = this.databaseId();
    return databaseId != null ? this._metadata.databases[databaseId] : null;
  }

  /**
   * @returns the database engine object, if a database is selected and loaded.
   */
  engine(): ?DatabaseEngine {
    const database = this.database();
    return database && database.engine;
  }

  /* Methods unique to this query type */

  /**
   * @returns a new reset @type {StructuredQuery} with the same parent @type {Question}
   */
  reset(): StructuredQuery {
    return new StructuredQuery(this._originalQuestion);
  }

  /**
   * @returns the underlying MBQL query object
   */
  query(): StructuredQueryObject {
    return this._structuredDatasetQuery.query;
  }

  setQuery(query: StructuredQueryObject): StructuredQuery {
    return this._updateQuery(() => query, []);
  }

  updateQuery(
    fn: (q: StructuredQueryObject) => StructuredQueryObject,
  ): StructuredQuery {
    return this._updateQuery(fn, []);
  }

  /**
   * @returns a new query with the provided Database set.
   */
  setDatabase(database: Database): StructuredQuery {
    if (database.id !== this.databaseId()) {
      // TODO: this should reset the rest of the query?
      return new StructuredQuery(
        this._originalQuestion,
        assoc(this.datasetQuery(), "database", database.id),
      );
    } else {
      return this;
    }
  }

  /**
   * @returns a new query with the provided Table set.
   */
  setTable(table: Table): StructuredQuery {
    if (table.id !== this.tableId()) {
      return new StructuredQuery(
        this._originalQuestion,
        chain(this.datasetQuery())
          .assoc("database", table.database.id)
          .assocIn(["query", "source_table"], table.id)
          .value(),
      );
    } else {
      return this;
    }
  }

  /**
   * @returns the table ID, if a table is selected.
   */
  tableId(): ?TableId {
    return this.query().source_table;
  }

  /**
   * @returns the table object, if a table is selected and loaded.
   * FIXME: actual return type should be `?Table`
   */
  table(): Table {
    return this._metadata.tables[this.tableId()];
  }

  /**
   * @deprecated Alias of `table()`. Use only when partially porting old code that uses @type {TableMetadata} object.
   */
  tableMetadata(): ?TableMetadata {
    return this.table();
  }

  clean() {
    const datasetQuery = this.datasetQuery();
    if (datasetQuery.query) {
      const query = Utils.copy(datasetQuery.query);

      return this.setDatasetQuery({
        ...datasetQuery,
        query: Q_deprecated.cleanQuery(query),
      });
    } else {
      return this;
    }
  }

  // AGGREGATIONS

  /**
   * @returns an array of MBQL @type {Aggregation}s.
   */
  aggregations(): Aggregation[] {
    return Q.getAggregations(this.query());
  }

  /**
   * @returns an array of aggregation wrapper objects
   * TODO Atte Keinänen 6/11/17: Make the wrapper objects the standard format for aggregations
   */
  aggregationsWrapped(): AggregationWrapper[] {
    return this.aggregations().map(agg => new AggregationWrapper(this, agg));
  }

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOptions(): AggregationOption[] {
    // TODO Should `aggregation_options` be wrapped already in selectors/metadata.js?
    const optionObjects = this.table() && this.table().aggregations();
    return optionObjects
      ? optionObjects.map(agg => new AggregationOption(agg))
      : [];
  }

  /**
   * @returns an array of aggregation options for the currently selected table, excluding the "rows" pseudo-aggregation
   */
  aggregationOptionsWithoutRows(): AggregationOption[] {
    return this.aggregationOptions().filter(option => option.short !== "rows");
  }

  /**
   * @returns the field options for the provided aggregation
   */
  aggregationFieldOptions(agg): DimensionOptions {
    const aggregation = this.table().aggregation(agg);
    if (aggregation) {
      const fieldOptions = this.fieldOptions(field => {
        return aggregation.validFieldsFilters[0]([field]).length === 1;
      });

      // HACK Atte Keinänen 6/18/17: Using `fieldOptions` with a field filter function
      // ends up often omitting all expressions because the field object of ExpressionDimension is empty.
      // Expressions can be applied to all aggregations so we can simply add all expressions to the
      // dimensions list in this hack.
      //
      // A real solution would have a `dimensionOptions` method instead of `fieldOptions` which would
      // enable filtering based on dimension properties.
      return {
        ...fieldOptions,
        dimensions: _.uniq([
          ...this.expressionDimensions(),
          ...fieldOptions.dimensions.filter(
            d => !(d instanceof ExpressionDimension),
          ),
        ]),
      };
    } else {
      return { count: 0, fks: [], dimensions: [] };
    }
  }

  /**
   * @returns true if the aggregation can be removed
   */
  canRemoveAggregation(): boolean {
    return this.aggregations().length > 1;
  }

  /**
   * @returns true if the query has no aggregation
   */
  isBareRows(): boolean {
    return Q.isBareRows(this.query());
  }

  /**
   * @returns the formatted named of the aggregation at the provided index.
   */
  aggregationName(index: number = 0): ?string {
    const aggregation = this.aggregations()[index];
    if (NamedClause.isNamed(aggregation)) {
      return NamedClause.getName(aggregation);
    } else if (AggregationClause.isCustom(aggregation)) {
      return formatExpression(aggregation, {
        tableMetadata: this.tableMetadata(),
        customFields: this.expressions(),
      });
    } else if (AggregationClause.isMetric(aggregation)) {
      const metricId = AggregationClause.getMetric(aggregation);
      const metric = this._metadata.metrics[metricId];
      if (metric) {
        return metric.name;
      }
    } else {
      const selectedAggregation = getAggregator(
        AggregationClause.getOperator(aggregation),
      );
      if (selectedAggregation) {
        let aggregationName = selectedAggregation.name.replace(" of ...", "");
        const fieldId = Q_deprecated.getFieldTargetId(
          AggregationClause.getField(aggregation),
        );
        const field = fieldId && this._metadata.fields[fieldId];
        if (field) {
          aggregationName += " of " + field.display_name;
        }
        return aggregationName;
      }
    }
    return null;
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Aggregation} added.
   */
  addAggregation(aggregation: Aggregation): StructuredQuery {
    return this._updateQuery(Q.addAggregation, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Aggregation} updated at the provided index.
   */
  updateAggregation(index: number, aggregation: Aggregation): StructuredQuery {
    return this._updateQuery(Q.updateAggregation, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the aggregation at the provided index removed.
   */
  removeAggregation(index: number): StructuredQuery {
    return this._updateQuery(Q.removeAggregation, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with all aggregations removed.
   */
  clearAggregations(): StructuredQuery {
    return this._updateQuery(Q.clearAggregations, arguments);
  }

  // BREAKOUTS

  /**
   * @returns An array of MBQL @type {Breakout}s.
   */
  breakouts(): Breakout[] {
    return Q.getBreakouts(this.query());
  }

  /**
   * @param includedBreakout The breakout to include even if it's already used
   * @param fieldFilter An option @type {Field} predicate to filter out options
   * @returns @type {DimensionOptions} that can be used as breakouts, excluding used breakouts, unless @param {breakout} is provided.
   */
  breakoutOptions(includedBreakout?: any, fieldFilter = () => true) {
    // the set of field ids being used by other breakouts
    const usedFields = new Set(
      this.breakouts()
        .filter(b => !_.isEqual(b, includedBreakout))
        .map(b => Q_deprecated.getFieldTargetId(b)),
    );

    return this.fieldOptions(
      field => fieldFilter(field) && !usedFields.has(field.id),
    );
  }

  /**
   * @returns whether a new breakout can be added or not
   */
  canAddBreakout(): boolean {
    return this.breakoutOptions().count > 0;
  }

  /**
   * @returns whether the current query has a valid breakout
   */
  hasValidBreakout(): boolean {
    return Q_deprecated.hasValidBreakout(this.query());
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Breakout} added.
   */
  addBreakout(breakout: Breakout) {
    return this._updateQuery(Q.addBreakout, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Breakout} updated at the provided index.
   */
  updateBreakout(index: number, breakout: Breakout) {
    return this._updateQuery(Q.updateBreakout, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the breakout at the provided index removed.
   */
  removeBreakout(index: number) {
    return this._updateQuery(Q.removeBreakout, arguments);
  }
  /**
   * @returns {StructuredQuery} new query with all breakouts removed.
   */
  clearBreakouts() {
    return this._updateQuery(Q.clearBreakouts, arguments);
  }

  // FILTERS

  /**
   * @returns An array of MBQL @type {Filter}s.
   */
  filters(): Filter[] {
    return Q.getFilters(this.query());
  }

  /**
   * @returns @type {DimensionOptions} that can be used in filters.
   */
  filterFieldOptions(): DimensionOptions {
    return this.fieldOptions();
  }

  /**
   * @returns @type {Segment}s that can be used as filters.
   */
  filterSegmentOptions(): Segment[] {
    return this.table().segments.filter(
      sgmt => sgmt.archived === false && !this.segments().includes(sgmt),
    );
  }

  /**
   *  @returns @type {Segment}s that are currently applied to the question
   */
  segments() {
    return this.filters()
      .filter(f => isSegmentFilter(f))
      .map(segmentFilter => {
        // segment id is stored as the second part of the filter clause
        // e.x. ["SEGMENT", 1]
        const segmentId = segmentFilter[1];
        return this.metadata().segment(segmentId);
      });
  }

  /**
   * @returns whether a new filter can be added or not
   */
  canAddFilter(): boolean {
    return (
      Q.canAddFilter(this.query()) &&
      (this.filterFieldOptions().count > 0 ||
        this.filterSegmentOptions().length > 0)
    );
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Filter} added.
   */
  addFilter(filter: Filter) {
    return this._updateQuery(Q.addFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Filter} updated at the provided index.
   */
  updateFilter(index: number, filter: Filter) {
    return this._updateQuery(Q.updateFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the filter at the provided index removed.
   */
  removeFilter(index: number) {
    return this._updateQuery(Q.removeFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with all filters removed.
   */
  clearFilters() {
    return this._updateQuery(Q.clearFilters, arguments);
  }

  // SORTS

  // TODO: standardize SORT vs ORDER_BY terminology

  sorts(): OrderBy[] {
    return Q.getOrderBys(this.query());
  }
  sortOptions(sort): DimensionOptions {
    let sortOptions = { count: 0, dimensions: [], fks: [] };
    // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
    if (this.isBareRows()) {
      const usedFields = new Set(
        this.sorts()
          .filter(b => !_.isEqual(b, sort))
          .map(b => Q_deprecated.getFieldTargetId(b[0])),
      );

      return this.fieldOptions(field => !usedFields.has(field.id));
    } else if (this.hasValidBreakout()) {
      for (const breakout of this.breakouts()) {
        sortOptions.dimensions.push(
          Dimension.parseMBQL(breakout, this._metadata),
        );
        sortOptions.count++;
      }
      for (const [index, aggregation] of this.aggregations().entries()) {
        if (Q_deprecated.canSortByAggregateField(this.query(), index)) {
          sortOptions.dimensions.push(
            new AggregationDimension(
              null,
              [index],
              this._metadata,
              aggregation[0],
            ),
          );
          sortOptions.count++;
        }
      }
    }
    return sortOptions;
  }
  canAddSort(): boolean {
    const sorts = this.sorts();
    return (
      this.sortOptions().count > 0 &&
      (sorts.length === 0 || sorts[sorts.length - 1][0] != null)
    );
  }

  addSort(order_by: OrderBy) {
    return this._updateQuery(Q.addOrderBy, arguments);
  }
  updateSort(index: number, order_by: OrderBy) {
    return this._updateQuery(Q.updateOrderBy, arguments);
  }
  removeSort(index: number) {
    return this._updateQuery(Q.removeOrderBy, arguments);
  }
  clearSort() {
    return this._updateQuery(Q.clearOrderBy, arguments);
  }
  replaceSort(order_by: OrderBy) {
    return this.clearSort().addSort(order_by);
  }

  // LIMIT

  limit(): ?number {
    return Q.getLimit(this.query());
  }
  updateLimit(limit: LimitClause) {
    return this._updateQuery(Q.updateLimit, arguments);
  }
  clearLimit() {
    return this._updateQuery(Q.clearLimit, arguments);
  }

  // EXPRESSIONS

  expressions(): { [key: string]: any } {
    return Q.getExpressions(this.query());
  }

  updateExpression(name, expression, oldName) {
    return this._updateQuery(Q.updateExpression, arguments);
  }

  removeExpression(name) {
    return this._updateQuery(Q.removeExpression, arguments);
  }

  // FIELDS
  /**
   * Returns dimension options that can appear in the `fields` clause
   */
  fieldsOptions(dimensionFilter = () => true): DimensionOptions {
    if (this.isBareRows() && this.breakouts().length === 0) {
      return this.dimensionOptions(dimensionFilter);
    }
    // TODO: allow adding fields connected by broken out PKs?
    return { count: 0, dimensions: [], fks: [] };
  }

  // DIMENSION OPTIONS

  // TODO Atte Keinänen 6/18/17: Refactor to dimensionOptions which takes a dimensionFilter
  // See aggregationFieldOptions for an explanation why that covers more use cases
  dimensionOptions(dimensionFilter = () => true): DimensionOptions {
    const dimensionOptions = {
      count: 0,
      fks: [],
      dimensions: [],
    };

    const table = this.tableMetadata();
    if (table) {
      const dimensionIsFKReference = dimension =>
        dimension.field && dimension.field() && dimension.field().isFK();

      const filteredNonFKDimensions = this.dimensions().filter(dimensionFilter);
      // .filter(d => !dimensionIsFKReference(d));

      for (const dimension of filteredNonFKDimensions) {
        dimensionOptions.count++;
        dimensionOptions.dimensions.push(dimension);
      }

      const fkDimensions = this.dimensions().filter(dimensionIsFKReference);
      for (const dimension of fkDimensions) {
        const fkDimensions = dimension
          .dimensions([FKDimension])
          .filter(dimensionFilter);

        if (fkDimensions.length > 0) {
          dimensionOptions.count += fkDimensions.length;
          dimensionOptions.fks.push({
            field: dimension.field(),
            dimension: dimension,
            dimensions: fkDimensions,
          });
        }
      }
    }

    return dimensionOptions;
  }

  // FIELD OPTIONS

  fieldOptions(fieldFilter = () => true) {
    const dimensionFilter = dimension => {
      const field = dimension.field && dimension.field();
      return !field || (field.isDimension() && fieldFilter(field));
    };
    return this.dimensionOptions(dimensionFilter);
  }

  // DIMENSIONS

  dimensions(): Dimension[] {
    return [...this.expressionDimensions(), ...this.tableDimensions()];
  }

  tableDimensions(): Dimension[] {
    const table: Table = this.table();
    return table ? table.dimensions() : [];
  }

  expressionDimensions(): Dimension[] {
    return Object.entries(this.expressions()).map(
      ([expressionName, expression]) => {
        return new ExpressionDimension(null, [expressionName]);
      },
    );
  }

  aggregationDimensions() {
    return this.breakouts().map(breakout =>
      Dimension.parseMBQL(breakout, this._metadata),
    );
  }

  metricDimensions() {
    return this.aggregations().map(
      (aggregation, index) =>
        new AggregationDimension(null, [index], this._metadata, aggregation[0]),
    );
  }

  fieldReferenceForColumn(column) {
    if (column.fk_field_id != null) {
      return ["fk->", column.fk_field_id, column.id];
    } else if (column.id != null) {
      return ["field-id", column.id];
    } else if (column["expression-name"] != null) {
      return ["expression", column["expression-name"]];
    } else if (column.source === "aggregation") {
      // FIXME: aggregations > 0?
      return ["aggregation", 0];
    }
  }

  parseFieldReference(fieldRef): ?Dimension {
    const dimension = Dimension.parseMBQL(fieldRef, this._metadata);
    if (dimension) {
      // HACK
      if (dimension instanceof AggregationDimension) {
        dimension._displayName = this.aggregations()[dimension._args[0]][0];
      }
      return dimension;
    }
  }

  setDatasetQuery(datasetQuery: DatasetQuery): StructuredQuery {
    return new StructuredQuery(this._originalQuestion, datasetQuery);
  }

  // INTERNAL

  _updateQuery(
    updateFunction: (
      query: StructuredQueryObject,
      ...args: any[]
    ) => StructuredQueryObject,
    args: any[],
  ): StructuredQuery {
    return this.setDatasetQuery(
      updateIn(this._datasetQuery, ["query"], query =>
        updateFunction(query, ...args),
      ),
    );
  }
}
