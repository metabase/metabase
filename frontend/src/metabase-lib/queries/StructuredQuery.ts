// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Represents a structured MBQL query.
 */
import _ from "underscore";
import { chain, updateIn } from "icepick";
import { t } from "ttag";
import type {
  Aggregation,
  Breakout,
  DatabaseId,
  DatasetColumn,
  DatasetQuery,
  DependentMetadataItem,
  ExpressionClause,
  Filter,
  Join,
  OrderBy,
  TableId,
  StructuredDatasetQuery,
  StructuredQuery as StructuredQueryObject,
} from "metabase-types/api";
import {
  format as formatExpression,
  DISPLAY_QUOTES,
} from "metabase-lib/expressions/format";
import {
  isVirtualCardId,
  getQuestionIdFromVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import {
  getAggregationOperators,
  isCompatibleAggregationOperatorForField,
} from "metabase-lib/operators/utils";
import { TYPE } from "metabase-lib/types/constants";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import { isSegment } from "metabase-lib/queries/utils/filter";
import { getUniqueExpressionName } from "metabase-lib/queries/utils/expression";
import * as Q from "metabase-lib/queries/utils/query";
import { createLookupByProperty } from "metabase-lib/utils";
import Dimension, {
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
} from "metabase-lib/Dimension";
import DimensionOptions from "metabase-lib/DimensionOptions";
import type { AggregationOperator } from "metabase-lib/deprecated-types";

import * as ML from "../v2";
import type { Limit, Query } from "../types";

import type Segment from "../metadata/Segment";
import type Database from "../metadata/Database";
import type Question from "../Question";
import type Table from "../metadata/Table";
import Field from "../metadata/Field";

import AtomicQuery from "./AtomicQuery";
import AggregationWrapper from "./structured/Aggregation";
import BreakoutWrapper from "./structured/Breakout";
import FilterWrapper from "./structured/Filter";
import JoinWrapper from "./structured/Join";

import { getStructuredQueryTable } from "./utils/structured-query-table";

type DimensionFilterFn = (dimension: Dimension) => boolean;
export type FieldFilterFn = (filter: Field) => boolean;

export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
};

export interface FilterSection {
  name: string;
  icon: string;
  items: (DimensionOption | SegmentOption)[];
}

export interface DimensionOption {
  dimension: Dimension;
}

// type guards for determining data types
export const isSegmentOption = (content: any): content is SegmentOption =>
  content?.filter && isSegment(content.filter);

export const isDimensionOption = (content: any): content is DimensionOption =>
  !!content?.dimension;

export interface SegmentOption {
  name: string;
  filter: ["segment", number];
  icon: string;
  query: StructuredQuery;
}

function unwrapJoin(join: Join | JoinWrapper): Join {
  return join instanceof JoinWrapper ? join.raw() : join;
}

/**
 * A wrapper around an MBQL (`query` type @type {DatasetQuery}) object
 */

class StructuredQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    return datasetQuery?.type === STRUCTURED_QUERY_TEMPLATE.type;
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
    this._structuredDatasetQuery = datasetQuery as StructuredDatasetQuery;
  }

  private getMLv2Query(): Query {
    return this.question()._getMLv2Query();
  }

  private updateWithMLv2(nextQuery: Query) {
    const nextMLv1Query = ML.toLegacyQuery(nextQuery);
    return this.setDatasetQuery(nextMLv1Query);
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
  isEditable() {
    return !this.readOnly() && this.hasMetadata();
  }

  /* AtomicQuery superclass methods */

  /**
   * @returns all tables in the currently selected database that can be used.
   */
  tables(): Table[] | null | undefined {
    const database = this.database();
    return (database && database.tables) || null;
  }

  /**
   * @returns the currently selected database ID, if any is selected.
   */
  databaseId(): DatabaseId | null | undefined {
    // same for both structured and native
    return this._structuredDatasetQuery.database;
  }

  /**
   * @returns the currently selected database metadata, if a database is selected and loaded.
   */
  database(): Database | null | undefined {
    const databaseId = this.databaseId();
    return databaseId != null ? this._metadata.database(databaseId) : null;
  }

  /**
   * @returns the database engine object, if a database is selected and loaded.
   */
  engine(): string | null | undefined {
    const database = this.database();
    return database && database.engine;
  }

  /**
   * Returns true if the database metadata (or lack thererof indicates the user can modify and run this query
   */
  readOnly() {
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
  sourceTableId(): TableId | null | undefined {
    return this.query()?.["source-table"];
  }

  sourceTable(): Table | null | undefined {
    const tableId = this.sourceTableId();
    return tableId != null ? this._metadata.table(tableId) : null;
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
          .assoc("query", {
            "source-table": tableId,
          })
          .value(),
      );
    } else {
      return this;
    }
  }

  /**
   * @deprecated: use sourceTableId
   */
  tableId(): TableId | null | undefined {
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
      const dateField = _.findWhere(table.fields, {
        name: "ga:date",
      });

      if (dateField) {
        return this.filter([
          "time-interval",
          ["field", dateField.id, null],
          -365,
          "day",
        ])
          .aggregate(["metric", "ga:users"])
          .aggregate(["metric", "ga:pageviews"])
          .breakout([
            "field",
            dateField.id,
            {
              "temporal-unit": "week",
            },
          ]);
      }
    }

    return this;
  }

  /**
   * @returns the table object, if a table is selected and loaded.
   */
  table = _.once((): Table | null => {
    return getStructuredQueryTable(this);
  });

  /**
   * Removes invalid clauses from the query (and source-query, recursively)
   */
  clean({ skipFilters = false } = {}): StructuredQuery {
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

    query = query.cleanJoins().cleanExpressions().cleanFields();

    if (!skipFilters) {
      query = query.cleanFilters();
    }

    return query.cleanEmpty();
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

  private cleanJoins(): StructuredQuery {
    return this._cleanClauseList("joins");
  }

  cleanExpressions(): StructuredQuery {
    return this; // TODO
  }

  cleanFilters(): StructuredQuery {
    return this._cleanClauseList("filters");
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

  isValid() {
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

    for (let index = 0; index < query[listName]().length; index++) {
      const clause = query[listName]()[index];

      if (!this._validateClause(clause)) {
        console.warn("Removing invalid MBQL clause", clause);
        query = clause.remove();
        // since we're removing them in order we need to decrement index when we remove one
        index -= 1;
      }
    }

    return query;
  }

  _isValidClauseList(listName) {
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
      console.warn("Error thrown while validating clause", clause, e);
      return false;
    }
  }

  hasData() {
    return !!this.table();
  }

  hasAnyClauses() {
    // this list should be kept in sync with BE in `metabase.models.card/model-supports-implicit-actions?`

    const query = this.getMLv2Query();
    const stageIndex = this.getQueryStageIndex();

    const hasJoins = ML.joins(query, stageIndex).length > 0;

    return (
      hasJoins ||
      this.hasExpressions() ||
      this.hasFilters() ||
      this.hasAggregations() ||
      this.hasBreakouts() ||
      this.hasSorts() ||
      this.hasLimit() ||
      this.hasFields()
    );
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
    const query = this.getMLv2Query();
    return ML.orderBys(query).length > 0;
  }

  hasLimit(stageIndex = this.queries().length - 1) {
    const query = this.getMLv2Query();
    return ML.hasLimit(query, stageIndex);
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
   * @deprecated use metabase-lib v2 to manage joins
   */
  join(join) {
    return this._updateQuery(Q.addJoin, [unwrapJoin(join)]);
  }

  // JOINS

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  joins = _.once((): JoinWrapper[] => {
    return Q.getJoins(this.query()).map(
      (join, index) => new JoinWrapper(join, index, this),
    );
  });

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  updateJoin(index, join) {
    return this._updateQuery(Q.updateJoin, [index, unwrapJoin(join)]);
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  removeJoin(_index) {
    return this._updateQuery(Q.removeJoin, arguments);
  }

  // AGGREGATIONS

  /**
   * @returns an array of MBQL @type {Aggregation}s.
   */
  aggregations = _.once((): AggregationWrapper[] => {
    return Q.getAggregations(this.query()).map(
      (aggregation, index) => new AggregationWrapper(aggregation, index, this),
    );
  });

  /**
   * @returns an array of aggregation options for the currently selected table
   */
  aggregationOperators = _.once((): AggregationOperator[] => {
    const table = this.table();

    if (table) {
      const fieldOptions = this.fieldOptions()
        .all()
        .map(dimension => dimension.field())
        .filter(field => field != null);

      return getAggregationOperators(table.db, fieldOptions);
    }

    return [];
  });

  aggregationOperatorsLookup = _.once(
    (): Record<string, AggregationOperator> => {
      return createLookupByProperty(this.aggregationOperators(), "short");
    },
  );

  aggregationOperator(short: string): AggregationOperator {
    return this.aggregationOperatorsLookup()[short];
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
      typeof agg === "string" ? this.aggregationOperator(agg) : agg;

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
      const compatibleDimensions = this.expressionDimensions().filter(d =>
        isCompatibleAggregationOperatorForField(aggregation, d.field()),
      );
      return new DimensionOptions({
        ...fieldOptions,
        dimensions: _.uniq([
          ...compatibleDimensions,
          ...fieldOptions.dimensions.filter(
            d => !(d instanceof ExpressionDimension),
          ),
        ]),
      });
    } else {
      return new DimensionOptions({
        count: 0,
        fks: [],
        dimensions: [],
      });
    }
  }

  /**
   * @returns true if the aggregation can be removed
   */
  canRemoveAggregation() {
    return this.aggregations().length > 1;
  }

  /**
   * @returns true if the query has no aggregation
   */
  isBareRows() {
    return !this.hasAggregations();
  }

  /**
   * @returns true if the query has no aggregation or breakouts
   */
  isRaw() {
    return !this.hasAggregations() && !this.hasBreakouts();
  }

  formatExpression(expression, { quotes = DISPLAY_QUOTES, ...options } = {}) {
    return formatExpression(expression, {
      quotes,
      ...options,
      legacyQuery: this,
    });
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Aggregation} added.
   */
  addAggregation(_aggregation: Aggregation): StructuredQuery {
    return this._updateQuery(Q.addAggregation, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Aggregation} updated at the provided index.
   */
  updateAggregation(
    _index: number,
    _aggregation: Aggregation,
  ): StructuredQuery {
    return this._updateQuery(Q.updateAggregation, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the aggregation at the provided index removed.
   */
  removeAggregation(_index: number): StructuredQuery {
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
  breakouts = _.once((): BreakoutWrapper[] => {
    if (this.query() == null) {
      return [];
    }

    return Q.getBreakouts(this.query()).map(
      (breakout, index) => new BreakoutWrapper(breakout, index, this),
    );
  });

  /**
   * @param includedBreakout The breakout to include in the options even if it's already used. If true, include all options.
   * @param fieldFilter An option @type {Field} predicate to filter out options
   * @param isValidation Temporary flag to ensure MLv1 and MLv2 compat during query clean phase
   * @returns @type {DimensionOptions} that can be used as breakouts, excluding used breakouts, unless @param {breakout} is provided.
   */
  breakoutOptions(
    includedBreakout?: any,
    fieldFilter: FieldFilterFn = () => true,
    isValidation = false,
  ): DimensionOptions {
    // the collection of field dimensions
    const breakoutDimensions =
      includedBreakout === true
        ? []
        : this.breakouts()
            .filter(breakout => !_.isEqual(breakout, includedBreakout))
            .map(breakout => breakout.dimension());

    function filter(dimension: Dimension) {
      return (
        fieldFilter(dimension.field()) &&
        !breakoutDimensions.some(breakoutDimension =>
          breakoutDimension.isSameBaseDimension(dimension),
        )
      );
    }

    return isValidation
      ? this.dimensionOptionsForValidation(filter)
      : this.dimensionOptions(filter);
  }

  /**
   * @returns whether a new breakout can be added or not
   */
  canAddBreakout() {
    return this.breakoutOptions().count > 0;
  }

  /**
   * @returns whether the current query has a valid breakout
   */
  hasValidBreakout() {
    const breakouts = this.breakouts();
    return breakouts.length > 0 && breakouts[0].isValid();
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Breakout} added.
   */
  addBreakout(_breakout: Breakout) {
    return this._updateQuery(Q.addBreakout, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Breakout} updated at the provided index.
   */
  updateBreakout(_index: number, _breakout: Breakout) {
    return this._updateQuery(Q.updateBreakout, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the breakout at the provided index removed.
   */
  removeBreakout(_index: number) {
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
  filters = _.once((): FilterWrapper[] => {
    return Q.getFilters(this.query()).map(
      (filter, index) => new FilterWrapper(filter, index, this),
    );
  });

  /**
   * @returns An array of MBQL @type {Filter}s from the last two query stages
   */
  topLevelFilters(stages = 2): FilterWrapper[] {
    const queries = this.queries().slice(-stages);
    return [].concat(...queries.map(q => q.filters()));
  }

  filterFieldOptionSections(
    filter?: (Filter | FilterWrapper) | null | undefined,
    { includeSegments = true } = {},
    includeAppliedSegments = false,
  ) {
    const filterDimensionOptions = this.filterDimensionOptions();
    const filterSegmentOptions = includeSegments
      ? this.filterSegmentOptions(filter, includeAppliedSegments)
      : [];
    return filterDimensionOptions.sections({
      extraItems: filterSegmentOptions.map(segment => ({
        name: segment.name,
        icon: "star",
        filter: ["segment", segment.id],
        query: this,
      })),
    });
  }

  topLevelFilterFieldOptionSections(
    filter = null,
    stages = 2,
    includeAppliedSegments = false,
  ): FilterSection[] {
    const queries = this.queries().slice(-stages);

    // allow post-aggregation filtering
    if (queries.length < stages && this.canNest() && this.hasBreakouts()) {
      queries.push(queries[queries.length - 1].nest());
    }

    queries.reverse();
    const sections = [].concat(
      ...queries.map(q =>
        q.filterFieldOptionSections(filter, undefined, includeAppliedSegments),
      ),
    );

    // special logic to only show aggregation dimensions for post-aggregation dimensions
    if (queries.length > 1) {
      const summarySection = {
        name: t`Summaries`,
        icon: "sum",
        items: [],
      };
      // only include aggregation dimensions
      summarySection.items = sections[0].items.filter(item => {
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
      sections.shift();
      sections.push(summarySection);
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
  filterSegmentOptions(
    filter?: Filter | FilterWrapper,
    includeAppliedSegments = false,
  ): Segment[] {
    if (filter && !(filter instanceof FilterWrapper)) {
      filter = new FilterWrapper(filter, null, this);
    }

    const currentSegmentId = filter && filter.isSegment() && filter.segmentId();
    return this.table().segments.filter(
      segment =>
        (currentSegmentId != null && currentSegmentId === segment.id) ||
        (!segment.archived &&
          (includeAppliedSegments || !this.segments().includes(segment))),
    );
  }

  /**
   *  @returns @type {Segment}s that are currently applied to the question
   */
  segments = _.once(() => {
    return this.filters()
      .filter(filter => filter.isSegment())
      .map(filter => filter.segment());
  });

  /**
   * @returns whether a new filter can be added or not
   */
  canAddFilter() {
    return (
      Q.canAddFilter(this.query()) &&
      (this.filterDimensionOptions().count > 0 ||
        this.filterSegmentOptions().length > 0)
    );
  }

  /**
   * @returns {StructuredQuery} new query with the provided MBQL @type {Filter} added.
   */
  addFilter(_filter: Filter | FilterWrapper) {
    return this._updateQuery(Q.addFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the MBQL @type {Filter} updated at the provided index.
   */
  updateFilter(_index: number, _filter: Filter | FilterWrapper) {
    return this._updateQuery(Q.updateFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with the filter at the provided index removed.
   */
  removeFilter(_index: number) {
    return this._updateQuery(Q.removeFilter, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with all filters removed.
   */
  clearFilters() {
    return this._updateQuery(Q.clearFilters, arguments);
  }

  /**
   * @returns {StructuredQuery} new query with all segment filters removed
   */
  clearSegments() {
    return this._updateQuery(Q.clearSegments, arguments);
  }

  // SORTS
  /**
   * @deprecated use the orderBys function from metabase-lib v2
   */
  sorts = _.once((): OrderBy[] => {
    return Q.getOrderBys(this.query());
  });

  /**
   * @deprecated use the orderBy function from metabase-lib v2
   */
  addSort(_orderBy: OrderBy) {
    return this._updateQuery(Q.addOrderBy, arguments);
  }

  /**
   * @deprecated use the clearOrderBys function from metabase-lib v2
   */
  clearSort() {
    return this._updateQuery(Q.clearOrderBy, arguments);
  }

  /**
   * @deprecated use the replaceClause function from metabase-lib v2
   */
  replaceSort(orderBy: OrderBy) {
    return this.clearSort().addSort(orderBy);
  }

  // LIMIT
  /**
   * @deprecated use metabase-lib v2's currentLimit function
   */
  limit(stageIndex = this.queries().length - 1): Limit {
    const query = this.getMLv2Query();
    return ML.currentLimit(query, stageIndex);
  }

  /**
   * @deprecated use metabase-lib v2's limit function
   */
  updateLimit(limit: Limit, stageIndex = this.queries().length - 1) {
    const query = this.getMLv2Query();
    const nextQuery = ML.limit(query, stageIndex, limit);
    return this.updateWithMLv2(nextQuery);
  }

  /**
   * @deprecated use metabase-lib v2's limit function
   */
  clearLimit() {
    return this.updateLimit(null);
  }

  // EXPRESSIONS
  expressions = _.once((): ExpressionClause => {
    return Q.getExpressions(this.query());
  });

  addExpression(name, expression) {
    const uniqueName = getUniqueExpressionName(this.expressions(), name);

    let query = this._updateQuery(Q.addExpression, [uniqueName, expression]);

    // extra logic for adding expressions in fields clause
    // TODO: push into query/expression?
    if (query.hasFields() && query.isRaw()) {
      query = query.addField(["expression", uniqueName]);
    }

    return query;
  }

  updateExpression(name, expression, oldName) {
    const isRename = oldName && oldName !== name;
    const uniqueName = isRename
      ? getUniqueExpressionName(this.expressions(), name)
      : name;

    let query = this._updateQuery(Q.updateExpression, [
      uniqueName,
      expression,
      oldName,
    ]);

    // extra logic for renaming expressions in fields clause
    // TODO: push into query/expression?
    if (isRename) {
      const index = query._indexOfField(["expression", oldName]);

      if (index >= 0) {
        query = query.updateField(index, ["expression", uniqueName]);
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

    if (!query.hasExpressions() && query.isRaw()) {
      query = query.clearFields();
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

    if (this.isRaw() && this.sourceQuery()) {
      query = query.clearFields();
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

  addField(_name, _expression) {
    return this._updateQuery(Q.addField, arguments);
  }

  updateField(_index, _field) {
    return this._updateQuery(Q.updateField, arguments);
  }

  removeField(_name) {
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
    dimensionFilter: DimensionFilterFn = _dimension => true,
  ): DimensionOptions {
    if (this.isBareRows() && !this.hasBreakouts()) {
      return this.dimensionOptions(dimensionFilter);
    }

    // TODO: allow adding fields connected by broken out PKs?
    return new DimensionOptions({
      count: 0,
      dimensions: [],
      fks: [],
    });
  }

  // DIMENSION OPTIONS
  _keyForFK(source, destination) {
    if (source && destination) {
      return `${source.id},${destination.id}`;
    }

    return null;
  }

  _getExplicitJoinsSet(joins) {
    const joinDimensionPairs = joins.map(join => {
      const dimensionPairs = join.getDimensions();
      return dimensionPairs.map(pair => {
        const [parentDimension, joinDimension] = pair;
        return this._keyForFK(
          parentDimension && parentDimension.field(),
          joinDimension && joinDimension.field(),
        );
      });
    });

    const flatJoinDimensions = _.flatten(joinDimensionPairs);

    const explicitJoins = new Set(flatJoinDimensions);
    explicitJoins.delete(null);
    return explicitJoins;
  }

  dimensionOptions(
    dimensionFilter: DimensionFilterFn = _dimension => true,
  ): DimensionOptions {
    const dimensionOptions = {
      count: 0,
      fks: [],
      dimensions: [],
    };
    const joins = this.joins();

    for (const join of joins) {
      const joinedDimensionOptions =
        join.joinedDimensionOptions(dimensionFilter);
      if (joinedDimensionOptions.count > 0) {
        dimensionOptions.count += joinedDimensionOptions.count;
        dimensionOptions.fks.push(joinedDimensionOptions);
      }
    }

    const table = this.table();

    if (table) {
      const filteredNonFKDimensions = this.dimensions().filter(dimensionFilter);

      for (const dimension of filteredNonFKDimensions) {
        dimensionOptions.count++;
        dimensionOptions.dimensions.push(dimension);
      }

      // de-duplicate explicit and implicit joined tables
      const explicitJoins = this._getExplicitJoinsSet(joins);

      const dimensionIsFKReference = dimension => dimension.field?.().isFK();
      const fkDimensions = this.dimensions().filter(dimensionIsFKReference);

      for (const dimension of fkDimensions) {
        const field = dimension.field();

        const queryHasExplicitJoin =
          field && explicitJoins.has(this._keyForFK(field, field.target));
        const isNestedCardTable = table?.isVirtualCard();
        const tableHasExplicitJoin =
          isNestedCardTable &&
          table.fields.find(
            tableField => tableField.id === field.fk_target_field_id,
          );

        if (queryHasExplicitJoin || tableHasExplicitJoin) {
          continue;
        }

        const fkDimensions = dimension
          .dimensions([FieldDimension])
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

  /**
   * An extension of dimensionOptions that includes MLv2 friendly dimensions.
   * MLv1 and MLv2 can produce different field references for the same field.
   *
   * Example: if a question is started from another question or model,
   * MLv2 will always use field literals like [ "field", "TOTAL", { "base-type": "type/Float" } ],
   * but MLv1 could trace it to a concrete field like [ "field", 1, null ].
   *
   * Because dimensionOptions is an MLv1 concept, in will only include concrete field refs in a case like that.
   * This method will add a field literal for each concrete field ref in the question, so MLv1 will treat them as valid.
   *
   * ⚠️ Should ONLY be used for clauses' `isValid` checks.
   */
  dimensionOptionsForValidation(
    dimensionFilter: DimensionFilter = _dimension => true,
  ): DimensionOptions {
    const baseOptions = this.dimensionOptions(dimensionFilter);

    const mlv2FriendlyDimensions: Dimension[] = [];

    baseOptions.dimensions.forEach(dimension => {
      if (dimension instanceof FieldDimension) {
        const field = dimension.field();
        const options = dimension.getOptions();

        // MLv1 picks up join-alias from parent questions/models.
        // They won't be available in MLv2's field literals,
        // so we need to remove them.
        const mlv2Options = _.omit(options, "join-alias");
        mlv2Options["base-type"] = field.base_type;

        if (isVirtualCardId(field.table_id)) {
          const mlv2Dimension = Dimension.parseMBQL([
            "field",
            field.name,
            mlv2Options,
          ]);
          mlv2FriendlyDimensions.push(mlv2Dimension);
        }
      }
    });

    return new DimensionOptions({
      count: baseOptions.count + mlv2FriendlyDimensions.length,
      dimensions: [...baseOptions.dimensions, ...mlv2FriendlyDimensions],
      fks: baseOptions.fks,
    });
  }

  // FIELD OPTIONS
  fieldOptions(fieldFilter: FieldFilterFn = _field => true): DimensionOptions {
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

  tableDimensions = _.once((): Dimension[] => {
    const table: Table = this.table();
    return table // HACK: ensure the dimensions are associated with this query
      ? table
          .dimensions()
          .map(d => (d._query ? d : this.parseFieldReference(d.mbql())))
      : [];
  });

  expressionDimensions = _.once((): Dimension[] => {
    return Object.entries(this.expressions()).map(
      ([expressionName, _expression]) => {
        return new ExpressionDimension(
          expressionName,
          null,
          this._metadata,
          this,
        );
      },
    );
  });

  /**
   * @deprecated use metabase-lib v2' to manage joins
   */
  private joinedDimensions = _.once((): Dimension[] => {
    return [].concat(...this.joins().map(join => join.fieldsDimensions()));
  });

  breakoutDimensions = _.once(() => {
    return this.breakouts().map(breakout => this.parseFieldReference(breakout));
  });

  aggregationDimensions = _.once(() => {
    return this.aggregations().map(aggregation =>
      aggregation.aggregationDimension(),
    );
  });

  fieldDimensions = _.once(() => {
    return this.fields().map((fieldClause, _index) =>
      this.parseFieldReference(fieldClause),
    );
  });

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  // NOTE: these will not have the correct columnName() if there are duplicates
  columnDimensions = _.once((): Dimension[] => {
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
        .sortBy(d => d.displayName()?.toLowerCase())
        .sortBy(d => {
          const type = d.field().semantic_type;
          return type === TYPE.PK ? 0 : type === TYPE.Name ? 1 : 2;
        })
        .sortBy(d => d.field().position)
        .value();

      return [...sorted, ...expressions, ...joined];
    }
  });

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  columnNames = _.once(() => {
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
  });

  columns = _.once(() => {
    const names = this.columnNames();
    return this.columnDimensions().map((dimension, index) => ({
      ...dimension.column(),
      name: names[index],
    }));
  });

  columnDimensionWithName(columnName) {
    const index = this.columnNames().findIndex(n => n === columnName);

    if (index >= 0) {
      return this.columnDimensions()[index];
    }
  }

  fieldReferenceForColumn(column) {
    return fieldRefForColumn(column);
  }

  setDatasetQuery(datasetQuery: DatasetQuery): StructuredQuery {
    return new StructuredQuery(this._originalQuestion, datasetQuery);
  }

  // NESTING
  nest(): StructuredQuery {
    return this._updateQuery(query => ({
      "source-query": query,
    }));
  }

  /**
   * The (wrapped) source query, if any
   */
  sourceQuery = _.once((): StructuredQuery | null | undefined => {
    const sourceQuery = this.query()?.["source-query"];

    if (sourceQuery) {
      return new NestedStructuredQuery(
        this._originalQuestion,
        { ...this.datasetQuery(), query: sourceQuery },
        this,
      );
    } else {
      return null;
    }
  });

  /**
   * Returns the "first" of the nested queries, or this query it not nested
   */
  rootQuery(): StructuredQuery {
    return this;
  }

  /**
   * Returns the "last" nested query that is already summarized, or `null` if none are
   * */
  lastSummarizedQuery = _.once((): StructuredQuery | null | undefined => {
    if (this.hasAggregations() || !this.canNest()) {
      return this;
    } else {
      const sourceQuery = this.sourceQuery();
      return sourceQuery ? sourceQuery.lastSummarizedQuery() : null;
    }
  });

  /**
   * Returns the "last" nested query that is already summarized, or the query itself.
   * Used in "view mode" to effectively ignore post-aggregation filter stages
   */
  topLevelQuery = _.once((): StructuredQuery => {
    if (!this.canNest()) {
      return this;
    } else {
      return this.lastSummarizedQuery() || this;
    }
  });

  /**
   * Returns the corresponding {Dimension} in the "top-level" {StructuredQuery}
   */
  topLevelDimension(dimension: Dimension): Dimension | null | undefined {
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

  dimensionForColumn(column: DatasetColumn) {
    if (column) {
      const fieldRef = this.fieldReferenceForColumn(column);

      if (fieldRef) {
        const dimension = this.queries()
          .flatMap(q => q.dimensions())
          .find(d => d.isEqual(fieldRef));

        return this.parseFieldReference(fieldRef, dimension?.query());
      }
    }

    return null;
  }

  /**
   * Returns the corresponding {Column} in the "top-level" {StructuredQuery}
   */
  topLevelColumn(column: DatasetColumn): DatasetColumn | null | undefined {
    const dimension = this.topLevelDimensionForColumn(column);

    if (dimension) {
      const topDimension = this.topLevelDimension(dimension);

      if (topDimension) {
        return topDimension.column();
      }
    }

    return null;
  }

  topLevelDimensionForColumn(column) {
    if (column) {
      const fieldRef = this.fieldReferenceForColumn(column);

      if (fieldRef) {
        return this.parseFieldReference(fieldRef);
      }
    }
  }

  /**
   * returns the corresponding {Dimension} in the sourceQuery, if any
   */
  dimensionForSourceQuery(dimension: Dimension): Dimension | null | undefined {
    if (dimension instanceof FieldDimension) {
      const sourceQuery = this.sourceQuery();

      if (sourceQuery) {
        const fieldIdOrName = dimension.fieldIdOrName();

        const columnIndex = sourceQuery
          .columns()
          .findIndex(c => c.id === fieldIdOrName || c.name === fieldIdOrName);

        if (columnIndex >= 0) {
          return sourceQuery.columnDimensions()[columnIndex];
        }
      }
    }

    return null;
  }

  /**
   * returns the original Table object at the beginning of the nested queries
   */
  rootTable = _.once((): Table => {
    const question = this.question();
    const questionTableId = question?.tableId();
    if (questionTableId != null) {
      return this.metadata().table(questionTableId);
    }

    return this.rootQuery().table();
  });

  /**
   * returns the original Table ID at the beginning of the nested queries
   */
  rootTableId(): TableId | null | undefined {
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

  getQueryStageIndex() {
    return this.queries().length - 1;
  }

  /**
   * Metadata this query needs to display correctly
   */
  dependentMetadata({ foreignTables = true } = {}): DependentMetadataItem[] {
    const dependencies = [];

    function addDependency(dep) {
      const existing = _.findWhere(dependencies, _.pick(dep, "type", "id"));

      if (existing) {
        Object.assign(existing, dep);
      } else {
        dependencies.push(dep);
      }
    }

    const dbId = this.databaseId();
    if (dbId) {
      addDependency({
        type: "schema",
        id: dbId,
      });
    }

    const tableId = this.sourceTableId();
    if (tableId) {
      addDependency({
        type: "table",
        id: tableId,
        foreignTables,
      });

      if (isVirtualCardId(tableId)) {
        addDependency({
          type: "question",
          id: getQuestionIdFromVirtualTableId(tableId),
        });
      }
    }

    // any explicitly joined tables
    for (const join of this.joins()) {
      join.dependentMetadata().forEach(addDependency);
    }

    // parent query's table IDs
    const sourceQuery = this.sourceQuery();

    if (sourceQuery) {
      sourceQuery
        .dependentMetadata({
          foreignTables,
        })
        .forEach(addDependency);
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StructuredQuery;

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

  rootQuery = _.once((): StructuredQuery => {
    return this.parentQuery().rootQuery();
  });

  parentQuery() {
    return this._parent.setSourceQuery(this.query());
  }
}
