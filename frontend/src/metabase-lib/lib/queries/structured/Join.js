/* @flow */

import { MBQLObjectClause } from "./MBQLClause";

import StructuredQuery from "../StructuredQuery";
import Dimension, { JoinedDimension } from "metabase-lib/lib/Dimension";
import MetabaseUtils from "metabase/lib/utils";

import _ from "underscore";
import { getIn } from "icepick";

const JOIN_STRATEGY_OPTIONS = [
  { value: "left-join", name: "Left outer join", icon: "join_left_outer" }, // default
  { value: "right-join", name: "Right outer join", icon: "join_right_outer" },
  { value: "inner-join", name: "Inner join", icon: "join_inner" },
  { value: "full-join", name: "Full outer join", icon: "join_full_outer" },
];

export default class Join extends MBQLObjectClause {
  constructor(...args) {
    super(...args);
    if (!this.alias) {
      this.alias = MetabaseUtils.uuid();
    }
  }

  displayName() {
    const table = this.joinedTable();
    return table && table.displayName();
  }

  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(join: Join | JoinObject): StructuredQuery {
    return this._query.updateJoin(this._index, join);
  }

  // SOURCE TABLE
  joinSourceTableId() {
    return this["source-table"];
  }
  setJoinSourceTableId(tableId, { defaultCondition = true } = {}) {
    if (tableId !== this["source-table"]) {
      const join = this.set({
        ...this,
        "source-query": undefined,
        "source-table": tableId,
        condition: null,
      });
      if (defaultCondition) {
        return join.setDefaultCondition();
      } else {
        return join;
      }
    }
  }

  // SOURCE QUERY
  joinSourceQuery() {
    return this["source-query"];
  }
  setJoinSourceQuery(query) {
    return this.set({
      ...this,
      "source-table": undefined,
      "source-query": query,
      condition: null,
    });
  }

  // STRATEGY
  setStrategy(strategy) {
    return this.set({ ...this, strategy });
  }
  strategyOption() {
    return this.strategy
      ? _.findWhere(this.strategyOptions(), { value: this.strategy })
      : JOIN_STRATEGY_OPTIONS[0];
  }
  strategyOptions() {
    const database = this.query().database();
    if (!database) {
      return [];
    }
    return JOIN_STRATEGY_OPTIONS.filter(({ value }) =>
      database.hasFeature(value),
    );
  }

  // CONDITION
  setCondition(condition) {
    return this.set({ ...this, condition });
  }
  setDefaultCondition() {
    const { dimensions } = this.parentDimensionOptions();
    // look for foreign keys linking the two tables
    const joinedTable = this.joinedTable();
    if (joinedTable && joinedTable.id != null) {
      const fk = _.find(dimensions, d => {
        const { target } = d.field();
        return target && target.table && target.table.id === joinedTable.id;
      });
      if (fk) {
        return this.setParentDimension(fk).setJoinDimension(
          this.joinedDimension(fk.field().target.dimension()),
        );
      }
    }
    return this;
  }

  // simplified "=" join condition helpers:
  parentDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[1]) {
      return this.query().parseFieldReference(this.condition[1]);
    }
  }
  parentDimensionOptions() {
    const dimensions = this.query().dimensions();
    return {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
  }
  setParentDimension(dimension) {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const joinDimension = this.joinDimension();
    return this.setCondition([
      "=",
      dimension,
      joinDimension && joinDimension.mbql(),
    ]);
  }

  joinDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[2]) {
      return this.joinedQuery().parseFieldReference(this.condition[2]);
    }
  }
  setJoinDimension(dimension) {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const parentDimension = this.parentDimension();
    return this.setCondition([
      "=",
      parentDimension && parentDimension.mbql(),
      dimension,
    ]);
  }
  joinDimensionOptions() {
    const dimensions = this.joinedDimensions();
    return {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
  }

  // HELPERS

  joinedQuery() {
    return this["source-table"]
      ? new StructuredQuery(this.query().question(), {
          type: "query",
          query: { "source-table": this["source-table"] },
        })
      : this["source-query"]
      ? new StructuredQuery(this.query().question(), {
          type: "query",
          query: this["source-query"],
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

  joinedDimensions() {
    const table = this.joinedTable();
    return table
      ? table.dimensions().map(dimension => this.joinedDimension(dimension))
      : [];
  }

  joinedDimension(dimension) {
    return new JoinedDimension(
      dimension,
      [this.alias],
      this.metadata(),
      this.query(),
    );
  }

  dependentTableIds() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentTableIds({ includeFKs: false })
      : [];
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeJoin(this._index);
  }

  isValid(): boolean {
    return !!(
      this.joinedTable() &&
      this.parentDimension() &&
      this.joinDimension()
    );
  }
}
