// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { pluralize } from "metabase/lib/formatting";
import type {
  ConcreteFieldReference,
  Join as JoinObject,
  JoinFields,
  JoinAlias,
  JoinCondition,
  JoinedFieldReference,
  TableId,
  StructuredQuery as StructuredQueryObject,
} from "metabase-types/api";
import {
  getDatetimeUnit,
  isDateTimeField,
} from "metabase-lib/queries/utils/field-ref";
import DimensionOptions from "metabase-lib/DimensionOptions";
import Dimension, { FieldDimension } from "metabase-lib/Dimension";
import StructuredQuery from "../StructuredQuery";
import { MBQLObjectClause } from "./MBQLClause";

const JOIN_OPERATORS = ["=", ">", "<", ">=", "<=", "!="];

const PARENT_DIMENSION_INDEX = 1;
const JOIN_DIMENSION_INDEX = 2;
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

  setJoinSourceTableId(tableId: TableId) {
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
  joinSourceQuery(): StructuredQueryObject | null | undefined {
    return this["source-query"];
  }

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

  // ALIAS
  setAlias(alias: JoinAlias) {
    alias = this._uniqueAlias(alias);

    if (alias !== this.alias) {
      let join = this.set({ ...this, alias });
      // propagate alias change to join dimension
      const joinDimensions = join.joinDimensions();
      joinDimensions.forEach((joinDimension, i) => {
        if (
          joinDimension instanceof FieldDimension &&
          joinDimension.joinAlias() &&
          joinDimension.joinAlias() === this.alias
        ) {
          const newDimension = joinDimension.withJoinAlias(alias);
          join = join.setJoinDimension({
            index: i,
            dimension: newDimension,
          });
        }
      });
      return join;
    }

    return this;
  }

  _getParentDimensionForAlias() {
    return this.parentDimensions().find(
      dimension => dimension && dimension.field().isFK(),
    );
  }

  setDefaultAlias() {
    // The Join alias should be "Table - FK Field" if possible. We need both to disamiguate sitatutions where we have
    // multiple FKs that point to the same Table -- see #8418 and #11452.
    //
    // The exception to this rule is cases where the the FK Field is basically the same as the Table name, e.g. a
    // "Product[s]" Table and a "product_id" FK Field (displayed as "Product"). It looks rediculous having
    // "Product[s] - Product". So in that case just show one or the other.
    const table = this.joinedTable();

    if (table && table.isSavedQuestion()) {
      // NOTE: special case for "Saved Questions" tables
      return this.setAlias(`Question ${table.savedQuestionId()}`);
    }

    const tableName = table && table.display_name;

    const parentDimension = this._getParentDimensionForAlias();

    const fieldName =
      parentDimension && parentDimension.field().targetObjectName();
    const similarTableAndFieldNames =
      tableName &&
      fieldName &&
      (tableName === fieldName ||
        pluralize(tableName) === fieldName ||
        tableName === pluralize(fieldName) ||
        pluralize(tableName) === pluralize(fieldName));
    // if for whatever reason we don't have both table *and* field name, fallback to either just field name or just
    // table name; if the world has gone mad just use 'source' instead of nothing
    const alias =
      (tableName &&
        fieldName &&
        !similarTableAndFieldNames &&
        tableName + " - " + fieldName) ||
      tableName ||
      fieldName ||
      "source";
    return this.setAlias(alias);
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

  getConditionByIndex(index) {
    if (!this.condition) {
      return null;
    }

    if (this.isSingleConditionJoin() && !index) {
      return this.condition;
    }

    if (this.isMultipleConditionsJoin()) {
      const [, ...conditions] = this.condition;
      return conditions[index];
    }

    return null;
  }

  setCondition(condition: JoinCondition): Join {
    return this.set({ ...this, condition });
  }

  setConditionByIndex({ index = 0, condition }): Join {
    if (!this.condition) {
      return this.setCondition(condition);
    }

    if (this.isSingleConditionJoin()) {
      if (index === 0) {
        return this.setCondition(condition);
      } else {
        return this.setCondition(["and", this.condition, condition]);
      }
    }

    const conditions = [...this.condition];
    conditions[index + 1] = condition;
    return this.setCondition(conditions);
  }

  removeCondition(index) {
    if (index == null || !this.getConditionByIndex(index)) {
      return this;
    }

    if (this.isSingleConditionJoin()) {
      return this.setCondition(null);
    }

    const filteredCondition = this.condition.filter((_, i) => {
      // Adding 1 because the first element of a condition is an operator ("and")
      return i !== index + 1;
    });
    const [, ...conditions] = filteredCondition;
    const isSingleNewCondition = conditions.length === 1;

    if (isSingleNewCondition) {
      return this.setCondition(conditions[0]);
    }

    return this.setCondition(filteredCondition);
  }

  setOperator(index, operator) {
    if (index == null || !this.getConditionByIndex(index)) {
      return this.setConditionByIndex({
        condition: [operator, null, null],
      });
    }

    const [_oldOperator, ...args] = this.getConditionByIndex(index);

    return this.setConditionByIndex({
      index,
      condition: [operator, ...args],
    });
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
        return this.setParentDimension({
          index: 0,
          dimension: fk,
        }).setJoinDimension({
          index: 0,
          dimension: this.joinedDimension(fk.field().target.dimension()),
        });
      }
    }

    return this;
  }

  _convertDimensionIntoMBQL(dimension: Dimension | ConcreteFieldReference) {
    return dimension instanceof Dimension ? dimension.mbql() : dimension;
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

  // simplified "=" join condition helpers:
  // NOTE: parentDimension refers to the left-hand side of the join,
  // and joinDimension refers to the right-hand side
  // TODO: should we rename them to lhsDimension/rhsDimension etc?
  _getParentDimensionFromCondition(condition) {
    const [, parentDimension] = condition;
    return parentDimension && this.query().parseFieldReference(parentDimension);
  }

  _getParentDimensionsFromMultipleConditions() {
    const [, ...conditions] = this.condition;
    return conditions.map(condition =>
      this._getParentDimensionFromCondition(condition),
    );
  }

  parentDimensions() {
    if (!this.condition) {
      return [];
    }

    return this.isSingleConditionJoin()
      ? [this._getParentDimensionFromCondition(this.condition)]
      : this._getParentDimensionsFromMultipleConditions();
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

  addEmptyDimensionsPair() {
    if (!this.condition) {
      return this.setCondition([]);
    }

    if (this.isSingleConditionJoin()) {
      return this.setCondition(["and", this.condition, []]);
    } else {
      return this.setCondition([...this.condition, []]);
    }
  }

  _isDateTimeDimensionsJoin(d1, d2) {
    return d1 && d2 && isDateTimeField(d1) && isDateTimeField(d2);
  }

  _getOperatorOrDefault(condition) {
    return condition?.[0] ?? "=";
  }

  _getDateTimeFieldCondition(
    parentDimension,
    joinDimension,
    temporalUnitSource,
    operator,
  ) {
    const temporalUnit = getDatetimeUnit(
      temporalUnitSource === "parent" ? parentDimension : joinDimension,
    );
    const parent = setTemporalUnit(parentDimension, temporalUnit);
    const join = setTemporalUnit(joinDimension, temporalUnit);
    return [operator, parent, join];
  }

  setJoinDimension({ index = 0, dimension, overwriteTemporalUnit = false }) {
    const condition = this.getConditionByIndex(index);
    const operator = this._getOperatorOrDefault(condition);

    const join = this._convertDimensionIntoMBQL(dimension);

    const parent = condition ? condition[PARENT_DIMENSION_INDEX] : null;
    const newCondition = this._isDateTimeDimensionsJoin(parent, join)
      ? this._getDateTimeFieldCondition(
          parent,
          join,
          overwriteTemporalUnit ? "join" : "parent",
          operator,
        )
      : [operator, parent, join];
    return this.setConditionByIndex({
      index,
      condition: newCondition,
    });
  }

  setParentDimension({ index = 0, dimension, overwriteTemporalUnit = false }) {
    const condition = this.getConditionByIndex(index);
    const operator = this._getOperatorOrDefault(condition);

    const parent = this._convertDimensionIntoMBQL(dimension);

    const join = condition ? condition[JOIN_DIMENSION_INDEX] : null;
    const newCondition = this._isDateTimeDimensionsJoin(parent, join)
      ? this._getDateTimeFieldCondition(
          parent,
          join,
          overwriteTemporalUnit ? "parent" : "join",
          operator,
        )
      : [operator, parent, join];
    return this.setConditionByIndex({
      index,
      condition: newCondition,
    });
  }

  joinDimensionOptions() {
    const dimensions = this.joinedDimensions();
    return new DimensionOptions({
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
      preventNumberSubDimensions: true,
    });
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

function setTemporalUnit(fieldRef, value) {
  const [field, id, opts] = fieldRef;
  return [field, id, { ...opts, "temporal-unit": value }];
}
