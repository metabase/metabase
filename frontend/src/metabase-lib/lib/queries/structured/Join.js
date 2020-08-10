/* @flow */

import { MBQLObjectClause } from "./MBQLClause";
import { t } from "ttag";

import StructuredQuery from "../StructuredQuery";
import Dimension, { JoinedDimension } from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import { TableId } from "metabase-types/types/Table";
import type {
  Join as JoinObject,
  JoinStrategy,
  JoinFields,
  JoinAlias,
  JoinCondition,
  JoinedFieldReference,
  StructuredQuery as StructuredQueryObject,
  ConcreteField,
} from "metabase-types/types/Query";

import _ from "underscore";

const JOIN_STRATEGY_OPTIONS = [
  { value: "left-join", name: t`Left outer join`, icon: "join_left_outer" }, // default
  { value: "right-join", name: t`Right outer join`, icon: "join_right_outer" },
  { value: "inner-join", name: t`Inner join`, icon: "join_inner" },
  { value: "full-join", name: t`Full outer join`, icon: "join_full_outer" },
];

export default class Join extends MBQLObjectClause {
  strategy: ?JoinStrategy;
  alias: ?JoinAlias;
  condition: ?JoinCondition;
  fields: ?JoinFields;
  // "source-query": ?StructuredQueryObject;
  // "source-table": ?TableId;

  set(join: any): Join {
    // $FlowFixMe
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
  joinSourceTableId(): ?TableId {
    // $FlowFixMe
    return this["source-table"];
  }
  setJoinSourceTableId(tableId: TableId) {
    // $FlowFixMe
    if (tableId !== this["source-table"]) {
      const join = this.set({
        ...this,
        "source-query": undefined,
        "source-table": tableId,
        condition: null,
      });
      if (!join.alias) {
        return join.setDefaultAlias();
      } else {
        return join;
      }
    } else {
      return this;
    }
  }

  // SOURCE QUERY
  joinSourceQuery(): ?StructuredQueryObject {
    // $FlowFixMe
    return this["source-query"];
  }
  setJoinSourceQuery(query: StructuredQuery) {
    return this.set({
      ...this,
      "source-table": undefined,
      "source-query": query,
      condition: null,
    });
  }

  // $FlowFixMe: will always return JoinAlias even though Flow doesn't think so
  _uniqueAlias(name: JoinAlias): JoinAlias {
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

  // FIELDS
  setFields(fields: JoinFields) {
    return this.set({ ...this, fields });
  }

  addField(field: JoinedFieldReference) {
    if (Array.isArray(this.fields)) {
      return this.setFields([...this.fields, field]);
    } else if (this.fields === "none") {
      return this.setFields([field]);
    } else {
      return this;
    }
  }

  clearFields() {
    return this.setFields("none");
  }

  // ALIAS
  setAlias(alias: JoinAlias) {
    alias = this._uniqueAlias(alias);
    if (alias !== this.alias) {
      const join = this.set({ ...this, alias });
      // propagate alias change to join dimension
      // TODO: do this in a generic way for all joined-field clauses in the query
      const joinDimension = join.joinDimension();
      if (
        joinDimension instanceof JoinedDimension &&
        joinDimension.joinAlias() === this.alias
      ) {
        // TODO: JoinedDimension should have setJoinAlias()
        const mbql = joinDimension.mbql();
        mbql[1] = alias;
        return join.setJoinDimension(mbql);
      } else {
        return join;
      }
    }
    return this;
  }

  setDefaultAlias() {
    const parentDimension = this.parentDimension();
    if (parentDimension && parentDimension.field().isFK()) {
      return this.setAlias(parentDimension.field().targetObjectName());
    } else {
      const table = this.joinedTable();
      // $FlowFixMe
      const match = String(table.id).match(/card__(\d+)/);
      if (match) {
        // NOTE: special case for "Saved Questions" tables
        return this.setAlias(`Question ${match[1]}`);
      } else {
        return this.setAlias((table && table.display_name) || "source");
      }
    }
  }

  // STRATEGY
  setStrategy(strategy: JoinStrategy) {
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
  setCondition(condition: JoinCondition): Join {
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
      return this.query().parseFieldReference(condition[1]);
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
    return new DimensionOptions(options);
  }
  setParentDimension(dimension: Dimension | ConcreteField): Join {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const joinDimension = this.joinDimension();
    return this.setCondition([
      "=",
      dimension,
      joinDimension instanceof Dimension ? joinDimension.mbql() : null,
    ]);
  }

  joinDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[2]) {
      const joinedQuery = this.joinedQuery();
      return joinedQuery && joinedQuery.parseFieldReference(condition[2]);
    }
  }
  setJoinDimension(dimension: Dimension | ConcreteField): Join {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const parentDimension = this.parentDimension();
    // $FlowFixMe
    return this.setCondition([
      "=",
      parentDimension instanceof Dimension ? parentDimension.mbql() : null,
      dimension,
    ]);
  }
  joinDimensionOptions() {
    const dimensions = this.joinedDimensions();
    return new DimensionOptions({
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    });
  }

  // HELPERS

  joinedQuery() {
    const sourceTable = this.joinSourceTableId();
    const sourceQuery = this.joinSourceQuery();
    return sourceTable
      ? new StructuredQuery(this.query().question(), {
          type: "query",
          query: { "source-table": sourceTable },
        })
      : sourceQuery
      ? new StructuredQuery(this.query().question(), {
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
    return this.query().parseFieldReference([
      "joined-field",
      this.alias,
      dimension.mbql(),
    ]);
  }

  dependentMetadata() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentMetadata({ foreignTables: false })
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
