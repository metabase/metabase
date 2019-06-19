/* @flow weak */

/**
 * Represents a structured MBQL query.
 */

import * as Q from "metabase/lib/query/query";
import Q_deprecated from "metabase/lib/query";
import { addValidOperatorsToFields } from "metabase/lib/schema_metadata";
import { format as formatExpression } from "metabase/lib/expressions/formatter";

import _ from "underscore";
import { chain, assoc, dissoc, updateIn } from "icepick";

import { memoize } from "metabase-lib/lib/utils";

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
  AggregationOption,
} from "metabase/meta/types/Metadata";

import Dimension, {
  FKDimension,
  ExpressionDimension,
  AggregationDimension,
  FieldLiteralDimension,
} from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import type Segment from "../metadata/Segment";
import type { DatabaseEngine, DatabaseId } from "metabase/meta/types/Database";
import type Database from "../metadata/Database";
import type Question from "../Question";
import type { TableId } from "metabase/meta/types/Table";

import Utils from "metabase/lib/utils";

import AtomicQuery from "./AtomicQuery";

import AggregationWrapper from "./structured/Aggregation";
import BreakoutWrapper from "./structured/Breakout";
import FilterWrapper from "./structured/Filter";
import JoinWrapper from "./structured/Join";

import Table from "../metadata/Table";
import Field from "../metadata/Field";
import { augmentDatabase } from "metabase/lib/table";

import { TYPE } from "metabase/lib/types";

import { isSegmentFilter } from "metabase/lib/query/filter";

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
        "source-table": tableId || null,
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
    // TODO: do we need other logic here or do we now ensure queries are always valid?
    return !!this.table();
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
   * @returns a new query with the provided Table set.
   */
  setTable(table: Table): StructuredQuery {
    return this.setTableId(table.id);
  }

  /**
   * @returns a new query with the provided Table ID set.
   */
  setTableId(tableId: TableId): StructuredQuery {
    if (tableId !== this.tableId()) {
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
   * @returns the table ID, if a table is selected.
   */
  tableId(): ?TableId {
    return this.query()["source-table"];
  }

  /**
   * @returns the table object, if a table is selected and loaded.
   */
  @memoize
  table(): Table {
    const sourceQuery = this.sourceQuery();
    if (sourceQuery) {
      const table = new Table({
        name: "",
        display_name: "",
        db: sourceQuery.database(),
        fields: sourceQuery.columns().map(
          (column, index) =>
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
      // HACK: ugh various parts of the UI still expect this stuff
      addValidOperatorsToFields(table);
      augmentDatabase({ tables: [table] });
      return table;
    } else {
      return this.metadata().table(this.tableId());
    }
  }

  /**
   * @deprecated Alias of `table()`. Use only when partially porting old code that uses @type {TableMetadata} object.
   */
  tableMetadata(): ?TableMetadata {
    return this.table();
  }

  /**
   * Removes invalid clauses from the query (and source-query, recursively)
   */
  clean() {
    let query = this;

    // first clean the sourceQuery, if any, recursively
    const sourceQuery = query.sourceQuery();
    if (sourceQuery) {
      query = query.setSourceQuery(sourceQuery.clean());
    }

    query = query
      .cleanJoins()
      .cleanExpressions()
      .cleanFilters()
      .cleanAggregations()
      .cleanBreakouts()
      .cleanSorts()
      .cleanLimit()
      .cleanFields();

    const newSourceQuery = query.sourceQuery();
    if (newSourceQuery && (query.isEmpty() || !query.hasAnyClauses())) {
      return newSourceQuery;
    }

    return query;
  }

  cleanJoins() {
    return this._cleanClauseList("joins");
  }

  cleanExpressions() {
    return this; // TODO
  }

  cleanFilters() {
    return this._cleanClauseList("filters");
  }

  cleanAggregations() {
    return this._cleanClauseList("aggregations");
  }

  cleanBreakouts() {
    return this._cleanClauseList("breakouts");
  }

  cleanSorts() {
    return this; // TODO
  }

  cleanLimit() {
    return this; // TODO
  }

  cleanFields() {
    return this; // TODO
  }

  _cleanClauseList(listName) {
    let query = this;
    for (let index = 0; index < query[listName]().length; index++) {
      if (!query[listName]()[index].isValid()) {
        query = query[listName]()[index].remove();
        // since we're removing them in order we need to decrement index when we remove one
        index -= 1;
      }
    }
    return query;
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
    return this.expressions().length > 0;
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
    return this.limit() > 0;
  }

  hasFields() {
    return this.fields().length > 0;
  }

  // JOINS

  /**
   * @returns an array of MBQL @type {Join}s.
   */
  joins(): Join[] {
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
  aggregations(): Aggregation[] {
    return Q.getAggregations(this.query()).map(
      (aggregation, index) => new AggregationWrapper(aggregation, index, this),
    );
  }

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOptions(): AggregationOption[] {
    return this.table() && this.table().aggregations();
  }

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOptionsWithoutRows(): AggregationOption[] {
    return this.aggregationOptions().filter(option => option.short !== "rows");
  }

  /**
   * @returns the field options for the provided aggregation
   */
  aggregationFieldOptions(agg: string | AggregationOption): DimensionOptions {
    const aggregation =
      typeof agg === "string" ? this.table().aggregation(agg) : agg;
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
    return Q.isBareRows(this.query());
  }

  /**
   * @returns true if the query has no aggregation or breakouts
   */
  isRaw(): boolean {
    return this.breakouts().length === 0 && this.aggregations().length === 0;
  }

  /**
   * @deprecated use this.aggregations()[index].displayName() directly
   * @returns the formatted named of the aggregation at the provided index.
   */
  aggregationName(index: number = 0): ?string {
    const aggregation = this.aggregations()[index];
    return aggregation && aggregation.displayName();
  }

  formatExpression(expression) {
    return formatExpression(expression, {
      tableMetadata: this.tableMetadata(),
      customFields: this.expressions(),
    });
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
  @memoize
  filters(): Filter[] {
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

  filterFieldOptionSections(filter?: Filter) {
    const filterFieldOptions = this.filterFieldOptions(filter);
    const filterSegmentOptions = this.filterSegmentOptions(filter);
    return filterFieldOptions.sections({
      extraItems: filterSegmentOptions.map(segment => ({
        name: segment.name,
        icon: "staroutline",
        filter: ["segment", segment.id],
        query: this,
      })),
    });
  }

  topLevelFilterFieldOptionSections(stages = 2) {
    const queries = this.queries().slice(-stages);
    // allow post-aggregation filtering
    if (queries.length < stages && this.breakouts().length > 0) {
      queries.push(queries[queries.length - 1].nest());
    }
    queries.reverse();

    return [].concat(...queries.map(q => q.filterFieldOptionSections()));
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
  filterSegmentOptions(filter?: Filter): Segment[] {
    const currentSegmentId =
      filter && filter.isSegmentFilter() && filter.segmentId();
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
      .filter(f => isSegmentFilter(f))
      .map(segmentFilter => {
        // segment id is stored as the second part of the filter clause
        // e.x. ["segment", 1]
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
    const sortOptions = { count: 0, dimensions: [], fks: [] };
    // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
    if (this.isBareRows()) {
      const usedFields = new Set(
        this.sorts()
          .filter(b => !_.isEqual(b, sort))
          .map(b => Q_deprecated.getFieldTargetId(b[1])),
      );

      return this.fieldOptions(field => !usedFields.has(field.id));
    } else if (this.hasValidBreakout()) {
      for (const breakout of this.breakouts()) {
        sortOptions.dimensions.push(this.parseFieldReference(breakout));
        sortOptions.count++;
      }
      for (const [index] of this.aggregations().entries()) {
        if (Q_deprecated.canSortByAggregateField(this.query(), index)) {
          sortOptions.dimensions.push(
            new AggregationDimension(null, [index], this._metadata, this),
          );
          sortOptions.count++;
        }
      }
    }
    return new DimensionOptions(sortOptions);
  }
  canAddSort(): boolean {
    const sorts = this.sorts();
    return (
      this.sortOptions().count > 0 &&
      (sorts.length === 0 || sorts[sorts.length - 1][0] != null)
    );
  }

  addSort(orderBy: OrderBy) {
    return this._updateQuery(Q.addOrderBy, arguments);
  }
  updateSort(index: number, orderBy: OrderBy) {
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
    return this._updateQuery(Q.addExpression, arguments);
  }

  updateExpression(name, expression, oldName) {
    return this._updateQuery(Q.updateExpression, arguments);
  }

  removeExpression(name) {
    return this._updateQuery(Q.removeExpression, arguments);
  }

  clearExpressions() {
    return this._updateQuery(Q.clearExpressions, arguments);
  }

  // FIELDS

  fields() {
    // FIMXE: implement field functions in query lib
    return this.query().fields || [];
  }

  clearFields() {
    return this._updateQuery(query => dissoc(query, "fields"));
  }

  /**
   * Returns dimension options that can appear in the `fields` clause
   */
  fieldsOptions(dimensionFilter = () => true): DimensionOptions {
    if (this.isBareRows() && this.breakouts().length === 0) {
      return this.dimensionOptions(dimensionFilter);
    }
    // TODO: allow adding fields connected by broken out PKs?
    return new DimensionOptions({ count: 0, dimensions: [], fks: [] });
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

    const joins = this.joins();
    for (const join of joins) {
      const joinedDimensions = join.joinedDimensions().filter(dimensionFilter);
      dimensionOptions.count += joinedDimensions.length;
      dimensionOptions.fks.push({
        icon: "join_left_outer",
        field: { display_name: join.displayName() },
        dimensions: joinedDimensions,
      });
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

    return new DimensionOptions(dimensionOptions);
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
    return table
      ? // HACK: ensure the dimensions are associated with this query
        table
          .dimensions()
          .map(d => (d._query ? d : this.parseFieldReference(d.mbql())))
      : [];
  }

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

  joinedDimensions(): Dimension[] {
    return [].concat(...this.joins().map(join => join.joinedDimensions()));
  }

  breakoutDimensions() {
    return this.breakouts().map(breakout => this.parseFieldReference(breakout));
  }

  aggregationDimensions() {
    return this.aggregations().map(
      (aggregation, index) =>
        new AggregationDimension(null, [index], this._metadata, this),
    );
  }

  fieldDimensions() {
    return this.fields().map((fieldClause, index) =>
      this.parseFieldReference(fieldClause),
    );
  }

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  // NOTE: these will not have the correct columnName() if there are duplicates
  @memoize
  columnDimensions() {
    const aggregations = this.aggregationDimensions();
    const breakouts = this.breakoutDimensions();
    const fields = this.fieldDimensions();
    if (aggregations.length || breakouts.length || fields.length) {
      return [...breakouts, ...aggregations, ...fields];
    } else {
      const expressions = this.expressionDimensions();
      const joined = this.joinedDimensions();
      const table = this.tableDimensions();
      const sorted = _.chain(table)
        .filter(d => d.field().visibility_type !== "hidden")
        .sortBy(d => d.field().name)
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

  fieldReferenceForColumn(column) {
    if (column.fk_field_id != null) {
      return ["fk->", column.fk_field_id, column.id];
    } else if (column.id != null) {
      return ["field-id", column.id];
    } else if (column.expression_name != null) {
      return ["expression", column.expression_name];
    } else if (column.source === "aggregation") {
      // HACK: ideally column would include the aggregation index directly
      const columnIndex = _.findIndex(
        this.columnNames(),
        name => name === column.name,
      );
      if (columnIndex >= 0) {
        return this.columnDimensions()[columnIndex].mbql();
      }
    }
    return null;
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

  nest() {
    return this._updateQuery(query => ({ "source-query": query }));
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
    }
  }

  /**
   * Returns the "first" of the nested queries, or this query it not nested
   */
  @memoize
  rootQuery(): Query {
    let query = this;
    let next;
    while ((next = query.sourceQuery())) {
      query = next;
    }
    return query;
  }

  /**
   * returns the original Table object at the beginning of the nested queries
   */
  sourceTable(): Table {
    return this.rootQuery().table();
  }

  setSourceQuery(sourceQuery: DatasetQuery | StructuredQuery): StructuredQuery {
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

  dependentTableIds({ includeFKs = true } = {}) {
    const tableIds = new Set();

    // source-table, if set
    const tableId = this.tableId();
    if (tableId) {
      tableIds.add(tableId);
      // implicit joins via foreign keys
      if (includeFKs) {
        const table = this.table();
        for (const field of table.fields) {
          if (field.target && field.target.table_id) {
            tableIds.add(field.target.table_id);
          }
        }
      }
    }

    // any explicitly joined tables
    for (const join of this.joins()) {
      for (const tableId of join.dependentTableIds()) {
        tableIds.add(tableId);
      }
    }

    // parent query's table IDs
    const sourceQuery = this.sourceQuery();
    if (sourceQuery) {
      for (const tableId of sourceQuery.dependentTableIds({ includeFKs })) {
        tableIds.add(tableId);
      }
    }

    return Array.from(tableIds);
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
  question() {
    return this.parentQuery().question();
  }
}
