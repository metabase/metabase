// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type {
  Join as JoinObject,
  JoinFields,
  JoinAlias,
  JoinCondition,
  JoinedFieldReference,
} from "metabase-types/api";
import DimensionOptions from "metabase-lib/DimensionOptions";
import type Dimension from "metabase-lib/Dimension";
import { FieldDimension } from "metabase-lib/Dimension";
import StructuredQuery from "../StructuredQuery";
import { MBQLObjectClause } from "./MBQLClause";

const JOIN_OPERATORS = ["=", ">", "<", ">=", "<=", "!="];

/**
 * @deprecated use metabase-lib v2 to manage joins
 */
class Join extends MBQLObjectClause {
  alias: JoinAlias | null | undefined;
  condition: JoinCondition | null | undefined;
  fields: JoinFields | null | undefined;

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  set(join: any): Join {
    return super.set(join);
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  remove(): StructuredQuery {
    return this._query.removeJoin(this._index);
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  replace(join: Join | JoinObject): StructuredQuery {
    return this._query.updateJoin(this._index, join);
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  displayName() {
    return this.alias;
  }

  private setFields(fields: JoinFields) {
    return this.set({ ...this, fields });
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  addField(field: JoinedFieldReference) {
    if (Array.isArray(this.fields)) {
      return this.setFields([...this.fields, field]);
    } else if (this.fields === "none") {
      return this.setFields([field]);
    } else {
      return this;
    }
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  clearFields() {
    return this.setFields("none");
  }

  private isSingleConditionJoin() {
    const { condition } = this;
    return Array.isArray(condition) && JOIN_OPERATORS.includes(condition[0]);
  }

  private getConditions() {
    if (!this.condition) {
      return [];
    }

    if (this.isSingleConditionJoin()) {
      return [this.condition];
    }

    const [, ...conditions] = this.condition;
    return conditions;
  }

  private joinedQuery() {
    const sourceTableId = this["source-table"];
    const sourceQuery = this["source-query"];
    return sourceTableId
      ? new StructuredQuery(this.legacyQuery().question().setDataset(false), {
          type: "query",
          query: {
            "source-table": sourceTableId,
          },
        })
      : sourceQuery
      ? new StructuredQuery(this.legacyQuery().question().setDataset(false), {
          type: "query",
          query: sourceQuery,
        })
      : null;
  }

  private joinedDimension(dimension: Dimension) {
    if (dimension instanceof FieldDimension) {
      return dimension.withJoinAlias(this.alias).setQuery(this.legacyQuery());
    }

    console.warn("Don't know how to create joined dimension with:", dimension);
    return dimension;
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  joinedTable() {
    return this?.joinedQuery?.().table?.();
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  getDimensions() {
    const conditions = this.getConditions();
    return conditions.map(condition => {
      const [, parentDimension, joinDimension] = condition;
      return [
        parentDimension
          ? this.legacyQuery().parseFieldReference(parentDimension)
          : null,
        joinDimension
          ? this.legacyQuery().parseFieldReference(joinDimension)
          : null,
      ];
    });
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  joinedDimensions() {
    const table = this.joinedTable();
    return table
      ? table.dimensions().map(dimension => this.joinedDimension(dimension))
      : [];
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  fieldsDimensions() {
    if (this.fields === "all") {
      return this.joinedDimensions();
    } else if (Array.isArray(this.fields)) {
      return this.fields.map(f => this.legacyQuery().parseFieldReference(f));
    } else {
      return [];
    }
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
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

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  dependentMetadata() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentMetadata({
          foreignTables: false,
        })
      : [];
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   */
  isValid() {
    // MLv2 should ensure there's a valid condition, etc.
    const parentTable = this.legacyQuery?.().table?.();
    return !!parentTable && !!this.joinedTable();
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Join;
