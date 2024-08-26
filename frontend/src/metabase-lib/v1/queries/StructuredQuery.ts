// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Represents a structured MBQL query.
 */
import { chain, updateIn } from "icepick";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type { Dimension } from "metabase-lib/v1/Dimension";
import { ExpressionDimension, FieldDimension } from "metabase-lib/v1/Dimension";
import DimensionOptions from "metabase-lib/v1/DimensionOptions";
import type { AggregationOperator } from "metabase-lib/v1/deprecated-types";
import {
  DISPLAY_QUOTES,
  format as formatExpression,
} from "metabase-lib/v1/expressions/format";
import { getAggregationOperators } from "metabase-lib/v1/operators/utils";
import * as Q from "metabase-lib/v1/queries/utils/query";
import { TYPE } from "metabase-lib/v1/types/constants";
import { createLookupByProperty } from "metabase-lib/v1/utils";
import type {
  Aggregation,
  DatabaseId,
  DatasetQuery,
  Filter,
  StructuredDatasetQuery,
  StructuredQuery as StructuredQueryObject,
  TableId,
} from "metabase-types/api";

import type { Query } from "../../types";
import type Question from "../Question";
import type Database from "../metadata/Database";
import type Field from "../metadata/Field";
import type Segment from "../metadata/Segment";
import type Table from "../metadata/Table";

import AtomicQuery from "./AtomicQuery";
import AggregationWrapper from "./structured/Aggregation";
import FilterWrapper from "./structured/Filter";

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

export interface SegmentOption {
  name: string;
  filter: ["segment", number];
  icon: string;
  query: StructuredQuery;
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
    const question = this.question();
    const metadata = question.metadata();
    return metadata.table(this._sourceTableId());
  });

  hasAggregations() {
    return this.aggregations().length > 0;
  }

  // ALIASES: allows

  /**
   * @returns alias for addAggregation
   */
  aggregate(aggregation: Aggregation): StructuredQuery {
    return this.addAggregation(aggregation);
  }

  /**
   * @returns alias for addFilter
   */
  filter(filter: Filter | FilterWrapper) {
    return this.addFilter(filter);
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
      return new DimensionOptions({
        ...fieldOptions,
        dimensions: _.uniq([
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
   * @returns true if the query has no aggregation
   */
  isRaw() {
    return !this.hasAggregations();
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

  // DIMENSION OPTIONS
  dimensionOptions(
    dimensionFilter: DimensionFilterFn = _dimension => true,
  ): DimensionOptions {
    const dimensionOptions = {
      count: 0,
      fks: [],
      dimensions: [],
    };

    const table = this.table();

    if (table) {
      const filteredNonFKDimensions = this.dimensions().filter(dimensionFilter);

      for (const dimension of filteredNonFKDimensions) {
        dimensionOptions.count++;
        dimensionOptions.dimensions.push(dimension);
      }

      const dimensionIsFKReference = dimension => dimension.field?.().isFK();
      const fkDimensions = this.dimensions().filter(dimensionIsFKReference);

      for (const dimension of fkDimensions) {
        const field = dimension.field();

        const isNestedCardTable = table?.isVirtualCard();
        const tableHasExplicitJoin =
          isNestedCardTable &&
          table.fields.find(
            tableField => tableField.id === field.fk_target_field_id,
          );

        if (tableHasExplicitJoin) {
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
    return this.tableDimensions();
  }

  tableDimensions = _.once((): Dimension[] => {
    const table: Table = this.table();
    return table // HACK: ensure the dimensions are associated with this query
      ? table
          .dimensions()
          .map(d => (d._query ? d : this.parseFieldReference(d.mbql())))
      : [];
  });

  aggregationDimensions = _.once(() => {
    return this.aggregations().map(aggregation =>
      aggregation.aggregationDimension(),
    );
  });

  // TODO: this replicates logic in the backend, we should have integration tests to ensure they match
  // NOTE: these will not have the correct columnName() if there are duplicates
  columnDimensions = _.once((): Dimension[] => {
    if (this.hasAggregations()) {
      return this.aggregationDimensions();
    } else {
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

      return sorted;
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
