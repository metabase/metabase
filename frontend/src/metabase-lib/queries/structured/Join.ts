// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type {
  Join as JoinObject,
  JoinFields,
  JoinAlias,
  JoinCondition,
  JoinedFieldReference,
  TableId,
  StructuredQuery as StructuredQueryObject,
} from "metabase-types/api";
import DimensionOptions from "metabase-lib/DimensionOptions";
import Dimension, { FieldDimension } from "metabase-lib/Dimension";
import StructuredQuery from "../StructuredQuery";
import { MBQLObjectClause } from "./MBQLClause";

const JOIN_OPERATORS = ["=", ">", "<", ">=", "<=", "!="];

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Join extends MBQLObjectClause {
  alias: JoinAlias | null | undefined;
  condition: JoinCondition | null | undefined;
  fields: JoinFields | null | undefined;

  // "source-query": ?StructuredQueryObject;
  // "source-table": ?TableId;
  set(join: any): Join {
    return super.set(join);
  }

  displayName() {
    return this.alias;
  }

  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(join: Join | JoinObject): StructuredQuery {
    return this._query.updateJoin(this._index, join);
  }

  // SOURCE TABLE
  joinSourceTableId(): TableId | null | undefined {
    return this["source-table"];
  }

  // SOURCE QUERY
  joinSourceQuery(): StructuredQueryObject | null | undefined {
    return this["source-query"];
  }

  private setFields(fields: JoinFields) {
    return this.set({ ...this, fields });
  }

  /**
   * @deprecated use metabase-lib v2 to manage joins
   * (still used by metabase-lib/queries/utils/dataset/syncTableColumnsToQuery)
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

  getConditions() {
    if (!this.condition) {
      return [];
    }

    if (this.isSingleConditionJoin()) {
      return [this.condition];
    }

    const [, ...conditions] = this.condition;
    return conditions;
  }

  // CONDITIONS
  isSingleConditionJoin() {
    const { condition } = this;
    return Array.isArray(condition) && JOIN_OPERATORS.includes(condition[0]);
  }

  isMultipleConditionsJoin() {
    const { condition } = this;
    return Array.isArray(condition) && condition[0] === "and";
  }

  _getJoinDimensionFromCondition(condition) {
    const [, , joinDimension] = condition;
    const joinedQuery = this.joinedQuery();
    return (
      joinedQuery &&
      joinDimension &&
      joinedQuery.parseFieldReference(joinDimension)
    );
  }

  _getJoinDimensionsFromMultipleConditions() {
    const [, ...conditions] = this.condition;
    return conditions.map(condition =>
      this._getJoinDimensionFromCondition(condition),
    );
  }

  parentDimensionOptions() {
    const query = this.query();
    const dimensions = query.dimensions();
    const options = {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
      preventNumberSubDimensions: true,
    };
    // add all previous joined fields
    const joins = query.joins();

    for (let i = 0; i < this.index(); i++) {
      const fkOptions = joins[i].joinedDimensionOptions();
      options.count += fkOptions.count;
      options.fks.push(fkOptions);
    }

    return new DimensionOptions(options);
  }

  joinDimensions() {
    if (!this.condition) {
      return [];
    }

    return this.isSingleConditionJoin()
      ? [this._getJoinDimensionFromCondition(this.condition)]
      : this._getJoinDimensionsFromMultipleConditions();
  }

  // HELPERS
  getDimensions() {
    const conditions = this.getConditions();
    return conditions.map(condition => {
      const [, parentDimension, joinDimension] = condition;
      return [
        parentDimension
          ? this.query().parseFieldReference(parentDimension)
          : null,
        joinDimension ? this.query().parseFieldReference(joinDimension) : null,
      ];
    });
  }

  joinedQuery() {
    const sourceTable = this.joinSourceTableId();
    const sourceQuery = this.joinSourceQuery();
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

  joinedTable() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery && joinedQuery.table();
  }

  parentQuery() {
    return this.query();
  }

  parentTable() {
    const parentQuery = this.parentQuery();
    return parentQuery && parentQuery.table();
  }

  /**
   * All possible joined dimensions
   */
  joinedDimensions() {
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

  joinedDimension(dimension: Dimension) {
    if (dimension instanceof FieldDimension) {
      return dimension.withJoinAlias(this.alias).setQuery(this.query());
    }

    console.warn("Don't know how to create joined dimension with:", dimension);
    return dimension;
  }

  dependentMetadata() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentMetadata({
          foreignTables: false,
        })
      : [];
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeJoin(this._index);
  }

  isValid() {
    // MLv2 should ensure there's a valid condition, etc.
    return !!this.parentTable() && !!this.joinedTable();
  }
}
