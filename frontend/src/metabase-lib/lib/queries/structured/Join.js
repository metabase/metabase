/* @flow */

import { MBQLObjectClause } from "./MBQLClause";

import StructuredQuery from "../StructuredQuery";
import Dimension, { JoinedDimension } from "metabase-lib/lib/Dimension";
import MetabaseUtils from "metabase/lib/utils";

import _ from "underscore";

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
    // TODO: should this just return alias, and we should be smarter about picking an alias?
    const table = this.table();
    return table && table.displayName();
  }

  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(join: Join | JoinObject): StructuredQuery {
    return this._query.updateJoin(this._index, join);
  }

  // TODO: rename sourceTableId
  tableId() {
    return this["source-table"];
  }

  // sourceTable() {
  //   return this.tableId() ? this.metadata().table(this.tableId()) : null;
  // }

  joinQuery() {
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

  table() {
    const joinQuery = this.joinQuery();
    return joinQuery && joinQuery.table();
  }

  setJoinTableId(tableId) {
    return this.set({
      ...this,
      "source-query": undefined,
      "source-table": tableId,
    });
  }
  setJoinQuery(query) {
    return this.set({
      ...this,
      "source-table": undefined,
      "source-query": query,
    });
  }
  setStrategy(strategy) {
    return this.set({ ...this, strategy });
  }
  setCondition(condition) {
    return this.set({ ...this, condition });
  }

  // simplified "=" join condition helpers:
  sourceDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[1]) {
      return this.query().parseFieldReference(this.condition[1]);
    }
  }
  sourceDimensionOptions() {
    const dimensions = this.query().dimensions();
    return {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
  }
  setSourceDimension(fieldRef) {
    const joinDimension = this.joinDimension();
    return this.setCondition([
      "=",
      fieldRef,
      joinDimension && joinDimension.mbql(),
    ]);
  }
  joinDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[2]) {
      return this.joinQuery().parseFieldReference(this.condition[2]);
    }
  }
  joinDimensionOptions() {
    const dimensions = this.joinedDimensions();
    return {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
  }
  setJoinDimension(fieldRef) {
    const sourceDimension = this.sourceDimension();
    return this.setCondition([
      "=",
      sourceDimension && sourceDimension.mbql(),
      fieldRef,
    ]);
  }

  joinedDimensions() {
    const table = this.table();
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
    const joinQuery = this.joinQuery();
    return joinQuery ? joinQuery.dependentTableIds({ includeFKs: false }) : [];
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

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeJoin(this._index);
  }
}
