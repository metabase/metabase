// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Represents a structured MBQL query.
 */
import { updateIn } from "icepick";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type { Dimension } from "metabase-lib/v1/Dimension";
import { FieldDimension } from "metabase-lib/v1/Dimension";
import DimensionOptions from "metabase-lib/v1/DimensionOptions";
import type {
  DatabaseId,
  DatasetQuery,
  StructuredDatasetQuery,
  StructuredQuery as StructuredQueryObject,
  TableId,
} from "metabase-types/api";

import type { Query } from "../../types";
import type Question from "../Question";
import type Database from "../metadata/Database";
import type Field from "../metadata/Field";
import type Table from "../metadata/Table";

import AtomicQuery from "./AtomicQuery";

type DimensionFilterFn = (dimension: Dimension) => boolean;
export type FieldFilterFn = (filter: Field) => boolean;

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
   * @returns the table object, if a table is selected and loaded.
   */
  table = _.once((): Table | null => {
    const question = this.question();
    const metadata = question.metadata();
    return metadata.table(this._sourceTableId());
  });

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
