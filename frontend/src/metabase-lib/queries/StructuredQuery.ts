// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Represents a structured MBQL query.
 */
import { chain, updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import Dimension, {
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
} from "metabase-lib/Dimension";
import DimensionOptions from "metabase-lib/DimensionOptions";
import type { AggregationOperator } from "metabase-lib/deprecated-types";
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
import { getUniqueExpressionName } from "metabase-lib/queries/utils/expression";
import { isSegment } from "metabase-lib/queries/utils/filter";
import * as Q from "metabase-lib/queries/utils/query";
import { TYPE } from "metabase-lib/types/constants";
import { createLookupByProperty } from "metabase-lib/utils";
import type {
  Aggregation,
  Breakout,
  DatabaseId,
  DatasetQuery,
  DependentMetadataItem,
  ExpressionClause,
  Filter,
  Join,
  TableId,
  StructuredDatasetQuery,
  StructuredQuery as StructuredQueryObject,
} from "metabase-types/api";

import type Question from "../Question";
import type Database from "../metadata/Database";
import Field from "../metadata/Field";
import type Segment from "../metadata/Segment";
import type Table from "../metadata/Table";
import type { Query } from "../types";

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
    return this.question().query();
  }

  /* Query superclass methods */

  /* AtomicQuery superclass methods */

  /**
   * @returns all tables in the currently selected database that can be used.
   */
  tables(): Table[] | null | undefined {
    const database = this._database();
    return (database && database.tables) || null;
  }

  /**
   * @returns the currently selected database ID, if any is selected.
   * @deprecated Use MLv2
   */
  _databaseId(): DatabaseId | null | undefined {
    // same for both structured and native
    return this._structuredDatasetQuery.database;
  }

  /**
   * @returns the currently selected database metadata, if a database is selected and loaded.
   * @deprecated Use MLv2
   */
  _database(): Database | null | undefined {
    const databaseId = this._databaseId();
    return databaseId != null ? this._metadata.database(databaseId) : null;
  }

  /* Methods unique to this query type */

  /**
   * @returns the underlying MBQL query object
   */
  legacyQuery(): StructuredQueryObject {
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
   * @returns the table ID, if a table is selected.
   * @deprecated Use MLv2
   */
  private _sourceTableId(): TableId | null | undefined {
    const query = this.getMLv2Query();
    const sourceTableId = Lib.sourceTableOrCardId(query);
    return sourceTableId;
  }

  /**
   * @returns a new query with the provided Table ID set.
   */
  setSourceTableId(tableId: TableId): StructuredQuery {
    if (tableId !== this._sourceTableId()) {
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
   * @returns the table object, if a table is selected and loaded.
   */
  table = _.once((): Table | null => {
    return getStructuredQueryTable(this.question(), this);
  });

  hasAggregations() {
    return this.aggregations().length > 0;
  }

  hasBreakouts() {
    return this.breakouts().length > 0;
  }

  _hasFields() {
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
    const legacyQuery = this.legacyQuery({ useStructuredQuery: true });
    if (!legacyQuery) {
      return [];
    }
    return Q.getJoins(legacyQuery).map(
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
    return Q.getAggregations(
      this.legacyQuery({ useStructuredQuery: true }),
    ).map(
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

  // BREAKOUTS

  /**
   * @returns An array of MBQL @type {Breakout}s.
   */
  breakouts = _.once((): BreakoutWrapper[] => {
    if (this.legacyQuery({ useStructuredQuery: true }) == null) {
      return [];
    }

    return Q.getBreakouts(this.legacyQuery({ useStructuredQuery: true })).map(
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
      ? this._dimensionOptionsForValidation(filter)
      : this.dimensionOptions(filter);
  }

  /**
   * @returns whether a new breakout can be added or not
   */
  canAddBreakout() {
    return this.breakoutOptions().count > 0;
  }

  canNest(): boolean {
    return Boolean(this._database()?.hasFeature("nested-queries"));
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

  // FILTERS

  /**
   * @returns An array of MBQL @type {Filter}s.
   */
  filters = _.once((): FilterWrapper[] => {
    return Q.getFilters(this.legacyQuery({ useStructuredQuery: true })).map(
      (filter, index) => new FilterWrapper(filter, index, this),
    );
  });

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
      Q.canAddFilter(this.legacyQuery({ useStructuredQuery: true })) &&
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

  // EXPRESSIONS
  expressions = _.once((): ExpressionClause => {
    return Q.getExpressions(this.legacyQuery({ useStructuredQuery: true }));
  });

  addExpression(name, expression) {
    const uniqueName = getUniqueExpressionName(this.expressions(), name);

    let query = this._updateQuery(Q.addExpression, [uniqueName, expression]);

    // extra logic for adding expressions in fields clause
    // TODO: push into query/expression?
    if (query._hasFields() && query.isRaw()) {
      query = query.addField(["expression", uniqueName]);
    }

    return query;
  }

  // FIELDS
  fields() {
    // FIMXE: implement field functions in query lib
    return this.legacyQuery({ useStructuredQuery: true }).fields || [];
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
  _dimensionOptionsForValidation(
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
    } else if (this._hasFields()) {
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
    const sourceQuery = this.legacyQuery({ useStructuredQuery: true })?.[
      "source-query"
    ];

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

  setSourceQuery(
    sourceQuery: StructuredQuery | StructuredQueryObject,
  ): StructuredQuery {
    if (sourceQuery instanceof StructuredQuery) {
      if (this.sourceQuery() === sourceQuery) {
        return this;
      }

      sourceQuery = sourceQuery.legacyQuery({ useStructuredQuery: true });
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

    const dbId = this._databaseId();
    if (dbId) {
      addDependency({
        type: "schema",
        id: dbId,
      });
    }

    const tableId = this._sourceTableId();
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
    return this._parent.setSourceQuery(
      this.legacyQuery({ useStructuredQuery: true }),
    );
  }
}
