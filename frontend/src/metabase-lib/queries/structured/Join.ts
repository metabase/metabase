// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type {
  JoinStrategy,
  JoinFields,
  JoinAlias,
  JoinCondition,
} from "metabase-types/api";
import DimensionOptions from "metabase-lib/DimensionOptions";
import Dimension, { FieldDimension } from "metabase-lib/Dimension";
import StructuredQuery from "../StructuredQuery";
import { MBQLObjectClause } from "./MBQLClause";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Join extends MBQLObjectClause {
  strategy: JoinStrategy | null | undefined;
  alias: JoinAlias | null | undefined;
  condition: JoinCondition | null | undefined;
  fields: JoinFields | null | undefined;

  private joinedQuery() {
    const sourceTable = this["source-table"];
    const sourceQuery = this["source-query"];
    return sourceTable
      ? new StructuredQuery(this.query().question().setDataset(false), {
          type: "query",
          query: {
            "source-table": sourceTable,
          },
        })
      : sourceQuery
      ? new StructuredQuery(this.query().question().setDataset(false), {
          type: "query",
          query: sourceQuery,
        })
      : null;
  }

  // Used by QuestionDataSource
  joinedTable() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery && joinedQuery.table();
  }

  private joinedDimension(dimension: Dimension) {
    if (dimension instanceof FieldDimension) {
      return dimension.withJoinAlias(this.alias).setQuery(this.query());
    }

    console.warn("Don't know how to create joined dimension with:", dimension);
    return dimension;
  }

  /**
   * All possible joined dimensions
   */
  private joinedDimensions() {
    const table = this.joinedTable();
    return table
      ? table.dimensions().map(dimension => this.joinedDimension(dimension))
      : [];
  }

  /**
   * Currently selected joined dimensions
   */
  fieldsDimensions() {
    if (this.fields === "all") {
      return this.joinedDimensions();
    } else if (Array.isArray(this.fields)) {
      return this.fields.map(f => this.query().parseFieldReference(f));
    } else {
      return [];
    }
  }

  joinedDimensionOptions(
    dimensionFilter: (d: Dimension) => boolean = () => true,
  ) {
    const dimensions = this.joinedDimensions().filter(dimensionFilter);
    return new DimensionOptions({
      name: this.displayName(),
      icon: "join_left_outer",
      dimensions: dimensions,
      fks: [],
      count: dimensions.length,
    });
  }

  dependentMetadata() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentMetadata({
          foreignTables: false,
        })
      : [];
  }
}
