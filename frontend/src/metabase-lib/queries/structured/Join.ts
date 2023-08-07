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

/**
 * @deprecated — use metabase-lib to manage joins whenever possible
 */
class Join extends MBQLObjectClause {
  strategy?: JoinStrategy | null;
  alias?: JoinAlias | null;
  condition?: JoinCondition | null;
  fields?: JoinFields | null;

  private joinedQuery() {
    const sourceTable = this["source-table"];
    const sourceQuery = this["source-query"];

    if (sourceTable) {
      const question = this.query().question().setDataset(false);
      return new StructuredQuery(question, {
        type: "query",
        query: {
          "source-table": sourceTable,
        },
      });
    }

    if (sourceQuery) {
      const question = this.query().question().setDataset(false);
      return new StructuredQuery(question, {
        type: "query",
        query: sourceQuery,
      });
    }

    return null;
  }

  private joinedTable() {
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

  private joinedDimensions() {
    const table = this.joinedTable();
    return table
      ? table.dimensions().map(dimension => this.joinedDimension(dimension))
      : [];
  }

  /**
   * @deprecated — use metabase-lib v2 to manage joins whenever possible
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

  /**
   * @deprecated — use metabase-lib v2 to manage joins whenever possible
   */
  joinedDimensionOptions(
    dimensionFilter: (d: Dimension) => boolean = () => true,
  ) {
    const dimensions = this.joinedDimensions().filter(dimensionFilter);
    return new DimensionOptions({
      name: this.alias,
      icon: "join_left_outer",
      dimensions: dimensions,
      fks: [],
      count: dimensions.length,
    });
  }

  /**
   * @deprecated — use metabase-lib v2 to manage joins whenever possible
   */
  dependentMetadata() {
    const joinedQuery = this.joinedQuery();
    if (joinedQuery) {
      return joinedQuery.dependentMetadata({ foreignTables: false });
    }
    return [];
  }

  /**
   * @deprecated — use metabase-lib v2 to manage joins whenever possible
   */
  isValid() {
    return !!this.joinedTable();
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Join;
