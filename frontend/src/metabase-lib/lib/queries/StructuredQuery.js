/* @flow weak */

/**
 * Represents a structured MBQL query.
 */

import * as Q from "metabase/lib/query/query";
import {
  format as formatExpression,
  DISPLAY_QUOTES,
} from "metabase/lib/expressions/format";

import _ from "underscore";
import { chain, updateIn } from "icepick";
import { t } from "ttag";

import { memoize } from "metabase-lib/lib/utils";

import type {
  StructuredQuery as StructuredQueryObject,
  Aggregation,
  Breakout,
  Filter,
  LimitClause,
  OrderBy,
} from "metabase-types/types/Query";
import type {
  DatasetQuery,
  StructuredDatasetQuery,
} from "metabase-types/types/Card";
import type { AggregationOperator } from "metabase-types/types/Metadata";

import Dimension, {
  FKDimension,
  ExpressionDimension,
  AggregationDimension,
  FieldLiteralDimension,
} from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import type Segment from "../metadata/Segment";
import type { DatabaseEngine, DatabaseId } from "metabase-types/types/Database";
import type Database from "../metadata/Database";
import type Question from "../Question";
import type { TableId } from "metabase-types/types/Table";
import type { Column } from "metabase-types/types/Dataset";

import AtomicQuery from "./AtomicQuery";

import AggregationWrapper from "./structured/Aggregation";
import BreakoutWrapper from "./structured/Breakout";
import FilterWrapper from "./structured/Filter";
import JoinWrapper from "./structured/Join";
import OrderByWrapper from "./structured/OrderBy";

import Table from "../metadata/Table";
import Field from "../metadata/Field";

import { TYPE } from "metabase/lib/types";

import { fieldRefForColumn } from "metabase/lib/dataset";

type DimensionFilter = (dimension: Dimension) => boolean;
type FieldFilter = (filter: Field) => boolean;

export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
};

/**
 * A wrapper around an MBQL (`query` type @type {DatasetQuery}) object
 */
export default class StructuredQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery): boolean {
    return datasetQuery && datasetQuery.type === STRUCTURED_QUERY_TEMPLATE.type;
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
    return !!(this.sourceTableId() || this.sourceQuery());
  }

  /**
   * @returns true if we have metadata for the root source table loaded
   */
  hasMetadata() {
    return this.metadata() && !!this.rootTable();
  }

  /**
   * @returns true if this query is in a state where it can be edited. Must have database and table set, and metadata for the table loaded.
   */
  isEditable(): boolean {
    return this.hasMetadata();
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
    return databaseId != null ? this._metadata.database(databaseId) : null;
  }

  /**
   * @returns the database engine object, if a database is selected and loaded.
   */
  engine(): ?DatabaseEngine {
    const database = this.database();
    return database && database.engine;
  }

  /**
   * Returns true if the database metadata (or lack thererof indicates the user can modify and run this query
   */
  readOnly(): boolean {
    return !this.database();
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

  clearQuery() {
    return this._updateQuery(() => ({}));
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
    return this.setDatabaseId(database.id);
  }

  /**
   * @returns a new query with the provided Database ID set.
   */
  setDatabaseId(databaseId: DatabaseId): StructuredQuery {
    if (databaseId !== this.databaseId()) {
      // TODO: this should reset the rest of the query?
      return new StructuredQuery(
        this._originalQuestion,
        chain(this.datasetQuery())
          .assoc("database", databaseId)
          .assoc("query", {})
          .value(),
      );
    } else {
      return this;
    }
  }

  /**
   * @returns the table ID, if a table is selected.
   */
  sourceTableId(): ?TableId {
    return this.query()["source-table"];
  }
  /**
   * @returns a new query with the provided Table ID set.
   */
  setSourceTableId(tableId: TableId): StructuredQuery {
    if (tableId !== this.sourceTableId()) {
      return new StructuredQuery(
        this._originalQuestion,
        chain(this.datasetQuery())
          .assoc("database", this.metadata().table(tableId).database.id)
          .assoc("query", { "source-table": tableId })
          .value(),
      );
    } else {
      return this;
    }
  }

  /**
   * @deprecated: use sourceTableId
   */
  tableId(): ?TableId {
    return this.sourceTableId();
  }
  /**
   * @deprecated: use setSourceTableId
   */
  setTableId(tableId: TableId): StructuredQuery {
    return this.setSourceTableId(tableId);
  }
  /**
   * @deprecated: use setSourceTableId
   */
  setTable(table: Table): StructuredQuery {
    return this.setSourceTableId(table.id);
  }

  /**
   *
   */
  setDefaultQuery(): StructuredQuery {
    const table = this.table();
    // NOTE: special case for Google Analytics which doesn't allow raw queries:
    if (
      table &&
      table.entity_type === "entity/GoogleAnalyticsTable" &&
      !this.isEmpty() &&
      !this.hasAnyClauses()
    ) {
      // NOTE: shold we check that a
      const dateField = _.findWhere(table.fields, { name: "ga:date" });
      if (dateField) {
        return this.filter([
          "time-interval",
          ["field-id", dateField.id],
          -365,
          "day",
        ])
          .aggregate(["metric", "ga:users"])
          .aggregate(["metric", "ga:pageviews"])
          .breakout(["datetime-field", ["field-id", dateField.id], "week"]);
      }
    }
    return this;
  }

  /**
   * @returns the table object, if a table is selected and loaded.
   */
  @memoize
  table(): Table {
    const sourceQuery = this.sourceQuery();
    if (sourceQuery) {
      return new Table({
        name: "",
        display_name: "",
        db: sourceQuery.database(),
        fields: sourceQuery.columns().map(
          column =>
            new Field({
              ...column,
              id: ["field-literal", column.name, column.base_type],
              source: "fields",
              // HACK: need to thread the query through to this fake Field
              query: this,
            }),
        ),
        segments: [],
        metrics: [],
      });
    } else {
      return this.metadata().table(this.sourceTableId());
    }
  }

  /**
   * Removes invalid clauses from the query (and source-query, recursively)
   */
  clean(): StructuredQuery {
    if (!this.hasMetadata()) {
      console.warn("Warning: can't clean query without metadata!");
      return this;
    }

    let query = this;

    // first clean the sourceQuery, if any, recursively
    const sourceQuery = query.sourceQuery();
    if (sourceQuery) {
      query = query.setSourceQuery(sourceQuery.clean());
    }

    return query
      .cleanJoins()
      .cleanExpressions()
      .cleanFilters()
      .cleanAggregations()
      .cleanBreakouts()
      .cleanSorts()
      .cleanLimit()
      .cleanFields()
      .cleanEmpty();
  }

  /**
   * Removes empty/useless layers of nesting (recursively)
   */
  cleanNesting(): StructuredQuery {
    // first clean the sourceQuery, if any, recursively
    const sourceQuery = this.sourceQuery();
    if (sourceQuery) {
      return this.setSourceQuery(sourceQuery.cleanNesting()).cleanEmpty();
    } else {
      return this;
    }
  }

  cleanJoins(): StructuredQuery {
    return this._cleanClauseList("joins");
  }

  cleanExpressions(): StructuredQuery {
    return this; // TODO
  }

  cleanFilters(): StructuredQuery {
    return this._cleanClauseList("filters");
  }

  cleanAggregations(): StructuredQuery {
    return this._cleanClauseList("aggregations");
  }

  cleanBreakouts(): StructuredQuery {
    return this._cleanClauseList("breakouts");
  }

  cleanSorts(): StructuredQuery {
    return this._cleanClauseList("sorts");
  }

  cleanLimit(): StructuredQuery {
    return this; // TODO
  }

  cleanFields(): StructuredQuery {
    return this; // TODO
  }

  /**
   * If this query is empty and there's a source-query, strip off this query, returning the source-query
   */
  cleanEmpty(): StructuredQuery {
    const sourceQuery = this.sourceQuery();
    if (sourceQuery && !this.hasAnyClauses()) {
      return sourceQuery;
    } else {
      return this;
    }
  }

  isValid(): boolean {
    if (!this.hasData()) {
      return false;
    }
    const sourceQuery = this.sourceQuery();
    if (sourceQuery && !sourceQuery.isValid()) {
      return false;
    }
    if (
      !this._isValidClauseList("joins") ||
      !this._isValidClauseList("filters") ||
      !this._isValidClauseList("aggregations") ||
      !this._isValidClauseList("breakouts")
    ) {
      return false;
    }
    const table = this.table();
    // NOTE: special case for Google Analytics which requires an aggregation
    if (table.entity_type === "entity/GoogleAnalyticsTable") {
      if (!this.hasAggregations()) {
        return false;
      }
    }
    return true;
  }

  _cleanClauseList(listName) {
    let query = this;
    // $FlowFixMe
    for (let index = 0; index < query[listName]().length; index++) {
      // $FlowFixMe
      const clause = query[listName]()[index];
      if (!this._validateClause(clause)) {
        query = clause.remove();
        // since we're removing them in order we need to decrement index when we remove one
        index -= 1;
      }
    }
    return query;
  }

  _isValidClauseList(listName) {
    // $FlowFixMe
    for (const clause of this[listName]()) {
      if (!this._validateClause(clause)) {
        return false;
      }
    }
    return true;
  }

  _validateClause(clause) {
    try {
      return clause.isValid();
    } catch (e) {
      console.warn("Error thrown while validating clause:", clause);
      return false;
    }
  }

  hasData() {
    return !!this.table();
  }

  hasAnyClauses() {
    return (
      this.hasJoins() ||
      this.hasExpressions() ||
      this.hasFilters() ||
      this.hasAggregations() ||
      this.hasBreakouts() ||
      this.hasSorts() ||
      this.hasLimit() ||
      this.hasFields()
    );
  }

  hasJoins() {
    return this.joins().length > 0;
  }

  hasExpressions() {
    return Object.keys(this.expressions()).length > 0;
  }

  hasFilters() {
    return this.filters().length > 0;
  }

  hasAggregations() {
    return this.aggregations().length > 0;
  }

  hasBreakouts() {
    return this.breakouts().length > 0;
  }

  hasSorts() {
    return this.sorts().length > 0;
  }

  hasLimit() {
    const limit = this.limit();
    return limit != null && limit > 0;
  }

  hasFields() {
    return this.fields().length > 0;
  }

  // ALIASES: allows

  /**
   * @returns alias for addAggregation
   */
  aggregate(aggregation: Aggregation): StructuredQuery {
    return this.addAggregation(aggregation);
  }

  /**
   * @returns alias for addBreakout
   */
  breakout(breakout: Breakout | Dimension | Field): StructuredQuery {
    if (breakout instanceof Field) {
      breakout = breakout.dimension();
    }
    if (breakout instanceof Dimension) {
      breakout = breakout.mbql();
    }
    return this.addBreakout(breakout);
  }

  /**
   * @returns alias for addFilter
   */
  filter(filter: Filter | FilterWrapper) {
    return this.addFilter(filter);
  }

  /**
   * @returns alias for addSort
   */
  sort(sort: OrderBy) {
    return this.addSort(sort);
  }

  /**
   * @returns alias for addJoin
   */
  join(join) {
    return this.addJoin(join);
  }

  // JOINS

  /**
   * @returns an array of MBQL @type {Join}s.
   */
  joins(): JoinWrapper[] {
    return Q.getJoins(this.query()).map(
      (join, index) => new JoinWrapper(join, index, this),
    );
  }

  addJoin(join) {
    return this._updateQuery(Q.addJoin, arguments);
  }

  updateJoin(index, join) {
    return this._updateQuery(Q.updateJoin, arguments);
  }

  removeJoin(index) {
    return this._updateQuery(Q.removeJoin, arguments);
  }

  clearJoins() {
    return this._updateQuery(Q.clearJoins, arguments);
  }

  // AGGREGATIONS

  /**
   * @returns an array of MBQL @type {Aggregation}s.
   */
  aggregations(): AggregationWrapper[] {
    return Q.getAggregations(this.query()).map(
      (aggregation, index) => new AggregationWrapper(aggregation, index, this),
    );
  }

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOperators(): AggregationOperator[] {
    return (this.table() && this.table().aggregationOperators()) || [];
  }

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOperatorsWithoutRows(): AggregationOperator[] {
    return this.aggregationOperators().filter(
      option => option.short !== "rows",
    );
  }

  /**
   * @returns the field options for the provided aggregation
   */
  aggregationFieldOptions(agg: string | AggregationOperator): DimensionOptions {
    const aggregation: AggregationOperator =
      typeof agg === "string" ? this.table().aggregationOperator(agg) : agg;
    if (aggregation) {
      const fieldOptions = this.fieldOptions(field => {
        return (
          aggregation.validFieldsFilters.length > 0 &&
          aggregation.validFieldsFilters[0]([field]).length === 1
        );
      });

      // HACK Atte Keinänen 6/18/17: Using `fieldOptions` with a field filter function
      // ends up often omitting all expressions because the field object of ExpressionDimension is empty.
      // Expressions can be applied to all aggregations so we can simply add all expressions to the
      // dimensions list in this hack.
      //
      // A real solution would have a `dimensionOptions` method instead of `fieldOptions` which would
      // enable filtering based on dimension properties.
      return new DimensionOptions({
        ...fieldOptions,
        dimensions: _.uniq([
          ...this.expressionDimensions(),
          ...fieldOptions.dimensions.filter(
            d => !(d instanceof ExpressionDimension),
          ),
        ]),
      });
    } else {
      return new DimensionOptions({ count: 0, fks: [], dimensions: [] });
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
    return !this.hasAggregations();
  }

  /**
   * @returns true if the query has no aggregation or breakouts
   */
  isRaw(): boolean {
    return !this.hasAggregations() && !this.hasBreakouts();
  }

  formatExpression(expression, { quotes = DISPLAY_QUOTES, ...options } = {}) {
    return formatExpression(expression, { quotes, ...options, query: this });
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
  breakouts(): BreakoutWrapper[] {
    return Q.getBreakouts(this.query()).map(
      (breakout, index) => new BreakoutWrapper(breakout, index, this),
    );
  }

  /**
   * @param includedBreakout The breakout to include even if it's already used
   * @param fieldFilter An option @type {Field} predicate to filter out options
   * @returns @type {DimensionOptions} that can be used as breakouts, excluding used breakouts, unless @param {breakout} is provided.
   */
  breakoutOptions(includedBreakout?: any, fieldFilter = () => true) {
    // the set of field ids being used by other breakouts
    const usedFields = new Set(
      includedBreakout === true
        ? []
        : this.breakouts()
            .filter(breakout => !_.isEqual(breakout, includedBreakout))
            .map(breakout => breakout.field().id),
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
    const breakouts = this.breakouts();
    return breakouts.length > 0 && breakouts[0].isValid();
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
  @memoize
  filters(): FilterWrapper[] {
    return Q.getFilters(this.query()).map(
      (filter, index) => new FilterWrapper(filter, index, this),
    );
  }

  /**
   * @returns An array of MBQL @type {Filter}s from the last two query stages
   */
  topLevelFilters(stages = 2): Filter[] {
    const queries = this.queries().slice(-stages);
    return [].concat(...queries.map(q => q.filters()));
  }

  filterFieldOptionSections(
    filter?: ?(Filter | FilterWrapper),
    { includeSegments = true } = {},
  ) {
    const filterDimensionOptions = this.filterDimensionOptions();
    const filterSegmentOptions = includeSegments
      ? this.filterSegmentOptions(filter)
      : [];
    return filterDimensionOptions.sections({
      extraItems: filterSegmentOptions.map(segment => ({
        name: segment.name,
        icon: "star_outline",
        filter: ["segment", segment.id],
        query: this,
      })),
    });
  }

  topLevelFilterFieldOptionSections(filter = null, stages = 2) {
    const queries = this.queries().slice(-stages);
    // allow post-aggregation filtering
    if (queries.length < stages && this.canNest() && this.hasBreakouts()) {
      queries.push(queries[queries.length - 1].nest());
    }
    queries.reverse();

    const sections = [].concat(
      ...queries.map(q => q.filterFieldOptionSections(filter)),
    );

    // special logic to only show aggregation dimensions for post-aggregation dimensions
    if (queries.length > 1) {
      // set the section title to `Metrics`
      sections[0].name = t`Metrics`;
      // only include aggregation dimensions
      sections[0].items = sections[0].items.filter(item => {
        if (item.dimension) {
          const sourceDimension = queries[0].dimensionForSourceQuery(
            item.dimension,
          );
          if (sourceDimension) {
            return sourceDimension instanceof AggregationDimension;
          }
        }
        return true;
      });
    }

    return sections;
  }

  /**
   * @returns @type {DimensionOptions} that can be used in filters.
   */
  filterDimensionOptions(): DimensionOptions {
    return this.dimensionOptions();
  }

  /**
   * @returns @type {Segment}s that can be used as filters.
   */
  filterSegmentOptions(filter?: Filter | FilterWrapper): Segment[] {
    if (filter && !(filter instanceof FilterWrapper)) {
      filter = new FilterWrapper(filter, null, this);
    }
    const currentSegmentId = filter && filter.isSegment() && filter.segmentId();
    return this.table().segments.filter(
      segment =>
        (currentSegmentId != null && currentSegmentId === segment.id) ||
        (!segment.archived && !this.segments().includes(segment)),
    );
  }

  /**
   *  @returns @type {Segment}s that are currently applied to the question
   */
  segments() {
    return this.filters()
      .filter(filter => filter.isSegment())
      .map(filter => filter.segment());
  }

  /**
   * @returns whether a new filter can be added or not
   */
  canAddFilter(): boolean {
    return (
      Q.canAddFilter(this.query()) &&
      (this.filterDimensionOptions().count > 0 ||
        this.filterSegmentOptions().length > 0)
    );
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Filter} added.
   */
  addFilter(filter: Filter | FilterWrapper) {
    return this._updateQuery(Q.addFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Filter} updated at the provided index.
   */
  updateFilter(index: number, filter: Filter | FilterWrapper) {
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

  @memoize
  sorts(): OrderByWrapper[] {
    return Q.getOrderBys(this.query()).map(
      (sort, index) => new OrderByWrapper(sort, index, this),
    );
  }

  sortOptions(includedSort): DimensionOptions {
    // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
    if (this.isBareRows()) {
      const usedFields = new Set(
        this.sorts()
          .filter(sort => !_.isEqual(sort, includedSort))
          .map(sort => sort.field().id),
      );
      return this.fieldOptions(field => !usedFields.has(field.id));
    } else if (this.hasValidBreakout()) {
      const sortOptions = { count: 0, dimensions: [], fks: [] };
      for (const breakout of this.breakouts()) {
        sortOptions.dimensions.push(breakout.dimension());
        sortOptions.count++;
      }
      if (this.hasBreakouts()) {
        for (const aggregation of this.aggregations()) {
          if (aggregation.isSortable()) {
            sortOptions.dimensions.push(aggregation.aggregationDimension());
            sortOptions.count++;
          }
        }
      }

      return new DimensionOptions(sortOptions);
    }
  }
  canAddSort(): boolean {
    const sorts = this.sorts();
    return (
      this.sortOptions().count > 0 &&
      (sorts.length === 0 || sorts[sorts.length - 1][0] != null)
    );
  }

  addSort(orderBy: OrderBy | OrderByWrapper) {
    return this._updateQuery(Q.addOrderBy, arguments);
  }
  updateSort(index: number, orderBy: OrderBy | OrderByWrapper) {
    return this._updateQuery(Q.updateOrderBy, arguments);
  }
  removeSort(index: number) {
    return this._updateQuery(Q.removeOrderBy, arguments);
  }
  clearSort() {
    return this._updateQuery(Q.clearOrderBy, arguments);
  }
  replaceSort(orderBy: OrderBy) {
    return this.clearSort().addSort(orderBy);
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

  addExpression(name, expression) {
    let query = this._updateQuery(Q.addExpression, arguments);
    // extra logic for adding expressions in fields clause
    // TODO: push into query/expression?
    if (query.hasFields() && query.isRaw()) {
      query = query.addField(["expression", name]);
    }
    return query;
  }

  updateExpression(name, expression, oldName) {
    let query = this._updateQuery(Q.updateExpression, arguments);
    // extra logic for renaming expressions in fields clause
    // TODO: push into query/expression?
    if (name !== oldName) {
      const index = query._indexOfField(["expression", oldName]);
      if (index >= 0) {
        query = query.updateField(index, ["expression", name]);
      }
    }
    return query;
  }

  removeExpression(name) {
    let query = this._updateQuery(Q.removeExpression, arguments);
    // extra logic for removing expressions in fields clause
    // TODO: push into query/expression?
    const index = query._indexOfField(["expression", name]);
    if (index >= 0) {
      query = query.removeField(index);
    }
    return query;
  }

  clearExpressions() {
    let query = this._updateQuery(Q.clearExpressions, arguments);
    // extra logic for removing expressions in fields clause
    // TODO: push into query/expression?
    for (const name of Object.keys(this.expressions())) {
      const index = query._indexOfField(["expression", name]);
      if (index >= 0) {
        query = query.removeField(index);
      }
    }
    return query;
  }

  _indexOfField(fieldRef) {
    return this.fields().findIndex(f => _.isEqual(f, fieldRef));
  }

  // FIELDS

  fields() {
    // FIMXE: implement field functions in query lib
    return this.query().fields || [];
  }

  addField(name, expression) {
    return this._updateQuery(Q.addField, arguments);
  }

  updateField(index, field) {
    return this._updateQuery(Q.updateField, arguments);
  }

  removeField(name) {
    return this._updateQuery(Q.removeField, arguments);
  }

  clearFields() {
    return this._updateQuery(Q.clearFields, arguments);
  }

  setFields(fields) {
    return this._updateQuery(q => ({ ...q, fields }));
  }

  /**
   * Returns dimension options that can appear in the `fields` clause
   */
  fieldsOptions(
    dimensionFilter: DimensionFilter = dimension => true,
  ): DimensionOptions {
    if (this.isBareRows() && !this.hasBreakouts()) {
      return this.dimensionOptions(dimensionFilter);
    }
    // TODO: allow adding fields connected by broken out PKs?
    return new DimensionOptions({ count: 0, dimensions: [], fks: [] });
  }

  // DIMENSION OPTIONS

  // TODO Atte Keinänen 6/18/17: Refactor to dimensionOptions which takes a dimensionFilter
  // See aggregationFieldOptions for an explanation why that covers more use cases
  dimensionOptions(
    dimensionFilter: DimensionFilter = dimension => true,
  ): DimensionOptions {
    const dimensionOptions = {
      count: 0,
      fks: [],
      dimensions: [],
    };

    const joins = this.joins();
    for (const join of joins) {
      const joinedDimensionOptions = join.joinedDimensionOptions(
        dimensionFilter,
      );
      dimensionOptions.count += joinedDimensionOptions.count;
      dimensionOptions.fks.push(joinedDimensionOptions);
    }

    const table = this.table();
    if (table) {
      const dimensionIsFKReference = dimension =>
        dimension.field && dimension.field() && dimension.field().isFK();

      const filteredNonFKDimensions = this.dimensions().filter(dimensionFilter);
      // .filter(d => !dimensionIsFKReference(d));

      for (const dimension of filteredNonFKDimensions) {
        dimensionOptions.count++;
        dimensionOptions.dimensions.push(dimension);
      }

      // de-duplicate explicit and implicit joined tables
      const keyForFk = (src, dst) =>
        src && dst ? `${src.id},${dst.id}` : null;
      const explicitJoins = new Set(
        joins.map(join => {
          const p = join.parentDimension();
          const j = join.joinDimension();
          return keyForFk(p && p.field(), j && j.field());
        }),
      );
      explicitJoins.delete(null);

      const fkDimensions = this.dimensions().filter(dimensionIsFKReference);
      for (const dimension of fkDimensions) {
        const field = dimension.field();
        if (field && explicitJoins.has(keyForFk(field, field.target))) {
          continue;
        }

        const fkDimensions = dimension
          .dimensions([FKDimension])
          .filter(dimensionFilter);

        if (fkDimensions.length > 0) {
          dimensionOptions.count += fkDimensions.length;
          dimensionOptions.fks.push({
            field: field,
            dimension: dimension,
            dimensions: fkDimensions,
          });
        }
      }
    }

    return new DimensionOptions(dimensionOptions);
  }

  // FIELD OPTIONS

  fieldOptions(fieldFilter: FieldFilter = field => true) {
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

  @memoize
  tableDimensions(): Dimension[] {
    const table: Table = this.table();
    return table
      ? // HACK: ensure the dimensions are associated with this query
        table
          .dimensions()
          .map(d => (d._query ? d : this.parseFieldReference(d.mbql())))
      : [];
  }

  @memoize
  expressionDimensions(): Dimension[] {
    return Object.entries(this.expressions()).map(
      ([expressionName, expression]) => {
        return new ExpressionDimension(
          null,
          [expressionName],
          this._metadata,
          this,
        );
      },
    );
  }

  @memoize
  joinedDimensions(): Dimension[] {
    return [].concat(...this.joins().map(join => join.fieldsDimensions()));
  }

  @memoize
  breakoutDimensions() {
    return this.breakouts().map(breakout => this.parseFieldReference(breakout));
  }

  @memoize
  aggregationDimensions() {
    return this.aggregations().map(aggregation =>
      aggregation.aggregationDimension(),
    );
  }

  @memoize
  fieldDimensions() {
    return this.fields().map((fieldClause, index) =>
      this.parseFieldReference(fieldClause),
    );
  }

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  // NOTE: these will not have the correct columnName() if there are duplicates
  @memoize
  columnDimensions() {
    if (this.hasAggregations() || this.hasBreakouts()) {
      const aggregations = this.aggregationDimensions();
      const breakouts = this.breakoutDimensions();
      return [...breakouts, ...aggregations];
    } else if (this.hasFields()) {
      const fields = this.fieldDimensions();
      const joined = this.joinedDimensions();
      return [...fields, ...joined];
    } else {
      const expressions = this.expressionDimensions();
      const joined = this.joinedDimensions();
      const table = this.tableDimensions();
      const sorted = _.chain(table)
        .filter(d => {
          const f = d.field();
          return (
            f.active !== false &&
            f.visibility_type !== "sensitive" &&
            f.visibility_type !== "retired" &&
            f.parent_id == null
          );
        })
        .sortBy(d => d.field().name.toLowerCase())
        .sortBy(d => {
          const type = d.field().special_type;
          return type === TYPE.PK ? 0 : type === TYPE.Name ? 1 : 2;
        })
        .sortBy(d => d.field().position)
        .value();
      return [...sorted, ...expressions, ...joined];
    }
  }

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  @memoize
  columnNames() {
    // NOTE: dimension.columnName() doesn't include suffixes for duplicated column names so we need to do that here
    const nameCounts = new Map();
    return this.columnDimensions().map(dimension => {
      const name = dimension.columnName();
      if (nameCounts.has(name)) {
        const count = nameCounts.get(name) + 1;
        nameCounts.set(name, count);
        return `${name}_${count}`;
      } else {
        nameCounts.set(name, 1);
        return name;
      }
    });
  }

  columns() {
    const names = this.columnNames();
    return this.columnDimensions().map((dimension, index) => ({
      ...dimension.column(),
      name: names[index],
    }));
  }

  columnDimensionWithName(columnName) {
    const index = this.columnNames().findIndex(n => n === columnName);
    if (index >= 0) {
      return this.columnDimensions()[index];
    }
  }

  fieldReferenceForColumn(column) {
    return fieldRefForColumn(column);
  }

  // TODO: better name may be parseDimension?
  parseFieldReference(fieldRef): ?Dimension {
    return Dimension.parseMBQL(fieldRef, this._metadata, this);
  }

  dimensionForColumn(column) {
    if (column) {
      const fieldRef = this.fieldReferenceForColumn(column);
      if (fieldRef) {
        return this.parseFieldReference(fieldRef);
      }
    }
    return null;
  }

  setDatasetQuery(datasetQuery: DatasetQuery): StructuredQuery {
    return new StructuredQuery(this._originalQuestion, datasetQuery);
  }

  // NESTING

  nest(): StructuredQuery {
    return this._updateQuery(query => ({ "source-query": query }));
  }

  canNest() {
    const db = this.database();
    return db && db.hasFeature("nested-queries");
  }

  /**
   * The (wrapped) source query, if any
   */
  @memoize
  sourceQuery(): ?StructuredQuery {
    const sourceQuery = this.query()["source-query"];
    if (sourceQuery) {
      return new NestedStructuredQuery(
        this._originalQuestion,
        { ...this.datasetQuery(), query: sourceQuery },
        this,
      );
    } else {
      return null;
    }
  }

  /**
   * Returns the "first" of the nested queries, or this query it not nested
   */
  @memoize
  rootQuery(): StructuredQuery {
    const sourceQuery = this.sourceQuery();
    return sourceQuery ? sourceQuery.rootQuery() : this;
  }

  /**
   * Returns the "last" nested query that is already summarized, or `null` if none are
   * */
  @memoize
  lastSummarizedQuery(): ?StructuredQuery {
    if (this.hasAggregations() || !this.canNest()) {
      return this;
    } else {
      const sourceQuery = this.sourceQuery();
      return sourceQuery ? sourceQuery.lastSummarizedQuery() : null;
    }
  }

  /**
   * Returns the "last" nested query that is already summarized, or the query itself.
   * Used in "view mode" to effectively ignore post-aggregation filter stages
   */
  @memoize
  topLevelQuery(): StructuredQuery {
    if (!this.canNest()) {
      return this;
    } else {
      return this.lastSummarizedQuery() || this;
    }
  }

  /**
   * Returns the corresponding {Dimension} in the "top-level" {StructuredQuery}
   */
  topLevelDimension(dimension: Dimension): ?Dimension {
    const topQuery = this.topLevelQuery();
    let query = this;
    while (query) {
      if (query === topQuery) {
        return dimension;
      } else {
        dimension = query.dimensionForSourceQuery(dimension);
        query = query.sourceQuery();
      }
    }
    return null;
  }

  /**
   * Returns the corresponding {Column} in the "top-level" {StructuredQuery}
   */
  topLevelColumn(column: Column): ?Column {
    const dimension = this.dimensionForColumn(column);
    if (dimension) {
      const topDimension = this.topLevelDimension(dimension);
      if (topDimension) {
        return topDimension.column();
      }
    }
    return null;
  }

  /**
   * returns the corresponding {Dimension} in the sourceQuery, if any
   */
  dimensionForSourceQuery(dimension: Dimension): ?Dimension {
    if (dimension instanceof FieldLiteralDimension) {
      const sourceQuery = this.sourceQuery();
      if (sourceQuery) {
        const index = sourceQuery.columnNames().indexOf(dimension.name());
        if (index >= 0) {
          return sourceQuery.columnDimensions()[index];
        }
      }
    }
    return null;
  }

  /**
   * returns the original Table object at the beginning of the nested queries
   */
  rootTable(): Table {
    return this.rootQuery().table();
  }

  /**
   * returns the original Table ID at the beginning of the nested queries
   */
  rootTableId(): ?TableId {
    return this.rootQuery().sourceTableId();
  }

  setSourceQuery(
    sourceQuery: StructuredQuery | StructuredQueryObject,
  ): StructuredQuery {
    if (sourceQuery instanceof StructuredQuery) {
      if (this.sourceQuery() === sourceQuery) {
        return this;
      }
      sourceQuery = sourceQuery.query();
    }
    // TODO: if the source query is modified in ways that make the parent query invalid we should "clean" those clauses
    return this._updateQuery(query =>
      chain(query)
        .dissoc("source-table")
        .assoc("source-query", sourceQuery)
        .value(),
    );
  }

  queries() {
    const queries = [];
    for (let query = this; query; query = query.sourceQuery()) {
      queries.unshift(query);
    }
    return queries;
  }

  /**
   * Metadata this query needs to display correctly
   */
  dependentMetadata({ foreignTables = true } = {}) {
    const dependencies = [];
    function addDependency(dep) {
      const existing = _.findWhere(dependencies, _.pick(dep, "type", "id"));
      if (existing) {
        Object.assign(existing, dep);
      } else {
        dependencies.push(dep);
      }
    }

    // source-table, if set
    const tableId = this.sourceTableId();
    if (tableId) {
      addDependency({ type: "table", id: tableId, foreignTables });
    }

    // any explicitly joined tables
    for (const join of this.joins()) {
      join.dependentMetadata().forEach(addDependency);
    }

    // parent query's table IDs
    const sourceQuery = this.sourceQuery();
    if (sourceQuery) {
      sourceQuery.dependentMetadata({ foreignTables }).forEach(addDependency);
    }

    return dependencies;
  }

  // INTERNAL

  _updateQuery(
    updateFunction: (
      query: StructuredQueryObject,
      ...args: any[]
    ) => StructuredQueryObject,
    args: any[] = [],
  ): StructuredQuery {
    return this.setDatasetQuery(
      updateIn(this._datasetQuery, ["query"], query =>
        updateFunction(query, ...args),
      ),
    );
  }
}

// subclass of StructuredQuery that's returned by query.sourceQuery() to allow manipulation of source-query
class NestedStructuredQuery extends StructuredQuery {
  _parent: StructuredQuery;

  constructor(question, datasetQuery, parent) {
    super(question, datasetQuery);
    this._parent = parent;
  }

  setDatasetQuery(datasetQuery: DatasetQuery): StructuredQuery {
    return new NestedStructuredQuery(
      this._originalQuestion,
      datasetQuery,
      this._parent,
    );
  }

  parentQuery() {
    return this._parent.setSourceQuery(this.query());
  }
}
