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
      const table = this.metadata().table(tableId);
      const join = this.set({
        ...this,
        "source-query": undefined,
        "source-table": tableId,
        alias: this._uniqueAlias((table && table.name) || `table_${tableId}`),
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
      alias: this._uniqueAlias("source"),
      condition: null,
    });
  }

  _uniqueAlias(name) {
    const usedAliases = new Set(
      this.query()
        .joins()
        .map(join => join.alias)
        .filter(alias => alias !== this.alias),
    );

    // alias can't be same as parent table name either
    const parentTable = this.parentTable();
    if (parentTable) {
      usedAliases.add(parentTable.name);
    }

    for (let index = 1; ; index++) {
      const alias = index === 1 ? name : `${name}_${index}`;
      if (!usedAliases.has(alias)) {
        return alias;
      }
    }
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

  // NOTE: parentDimension refers to the left-hand side of the join,
  // and joinDimension refers to the right-hand side
  // TODO: should we rename them to lhsDimension/rhsDimension etc?

  parentDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[1]) {
      return this.query().parseFieldReference(this.condition[1]);
    }
  }
  parentDimensionOptions() {
    const query = this.query();
    const dimensions = query.dimensions();
    const options = {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
    // add all previous joined fields
    const joins = query.joins();
    for (let i = 0; i < this.index(); i++) {
      const fkOptions = joins[i].joinedDimensionOptions();
      options.count += fkOptions.count;
      options.fks.push(fkOptions);
    }
    return options;
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

  joinedDimensionOptions(dimensionFilter = () => true) {
    const dimensions = this.joinedDimensions().filter(dimensionFilter);
    return {
      name: this.displayName(),
      icon: "join_left_outer",
      dimensions: dimensions,
      fks: [],
      count: dimensions.length,
    };
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
