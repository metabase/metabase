import type { Aggregation as AggregationObject } from "metabase/meta/types/Query";
import { AggregationClause as AggregationClause_DEPRECATED } from "metabase/lib/query";
import { MetricId } from "metabase/meta/types/Metric";
import { AggregationOption, Operator } from "metabase/meta/types/Metadata";
import { FieldId } from "metabase/meta/types/Field";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

/**
 * Wrapper for an aggregation contained by a {@link StructuredQuery}
 */
export default class Aggregation {
  _query: ?StructuredQuery;

  clause: AggregationObject;

  constructor(query?: StructuredQuery, clause: AggregationObject): Aggregation {
    this._query = query;
    this.clause = clause;
  }

  /**
   * Gets the aggregation option matching this aggregation
   * Returns `null` if the clause isn't in a standard format
   */
  getOption(): ?AggregationOption {
    if (this._query == null) {
      return null;
    }

    const operator = this.getOperator();
    return operator
      ? this._query
          .aggregationOptions()
          .find(option => option.short === operator)
      : null;
  }

  /**
   * Predicate function to test if a given aggregation clause is fully formed
   */
  isValid(): boolean {
    return AggregationClause_DEPRECATED.isValid(this.clause);
  }

  /**
   * Predicate function to test if the given aggregation clause represents a Bare Rows aggregation
   */
  isBareRows(): boolean {
    return AggregationClause_DEPRECATED.isBareRows(this.clause);
  }

  /**
   * Predicate function to test if a given aggregation clause represents a standard aggregation
   */
  isStandard(): boolean {
    return AggregationClause_DEPRECATED.isStandard(this.clause);
  }

  getAggregation() {
    return AggregationClause_DEPRECATED.getAggregation(this.clause);
  }

  /**
   * Predicate function to test if a given aggregation clause represents a metric
   */
  isMetric(): boolean {
    return AggregationClause_DEPRECATED.isMetric(this.clause);
  }

  /**
   * Get metricId from a metric aggregation clause
   * Returns `null` if the clause doesn't represent a metric
   */
  getMetric(): ?MetricId {
    return AggregationClause_DEPRECATED.getMetric(this.clause);
  }

  /**
   * Is a custom expression created with the expression editor
   */
  isCustom(): boolean {
    return AggregationClause_DEPRECATED.isCustom(this.clause);
  }

  /**
   * Get the operator from a standard aggregation clause
   * Returns `null` if the clause isn't in a standard format
   */
  getOperator(): ?Operator {
    return AggregationClause_DEPRECATED.getOperator(this.clause);
  }

  /**
   * Get the fieldId from a standard aggregation clause
   * Returns `null` if the clause isn't in a standard format
   */
  getField(): ?FieldId {
    return AggregationClause_DEPRECATED.getField(this.clause);
  }

  /**
   * Set the fieldId on a standard aggregation clause.
   * If the clause isn't in a standard format, no modifications are done.
   */
  setField(fieldId: FieldId): Aggregation {
    return new Aggregation(
      this._query,
      AggregationClause_DEPRECATED.setField(this.clause, fieldId),
    );
  }
}
