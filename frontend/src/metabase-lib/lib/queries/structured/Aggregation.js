/* @flow */

import MBQLClause from "./MBQLClause";

import { t } from "ttag";

import { TYPE } from "metabase/lib/types";

import * as AGGREGATION from "metabase/lib/query/aggregation";

import { AggregationDimension } from "../../Dimension";

import type { Aggregation as AggregationObject } from "metabase-types/types/Query";
import type StructuredQuery from "../StructuredQuery";
import type Dimension from "../../Dimension";
import type { AggregationOperator } from "metabase-types/types/Metadata";
import type { MetricId } from "metabase-types/types/Metric";
import type { FieldId } from "metabase-types/types/Field";

const INTEGER_AGGREGATIONS = new Set(["count", "cum-count", "distinct"]);

export default class Aggregation extends MBQLClause {
  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   * or replaces itself in the parent query if no {aggregation} argument is provided.
   */
  replace(aggregation?: AggregationObject | Aggregation): StructuredQuery {
    if (aggregation != null) {
      return this._query.updateAggregation(this._index, aggregation);
    } else {
      return this._query.updateAggregation(this._index, this);
    }
  }

  /**
   * Adds itself to the parent query and returns the new StructuredQuery
   */
  add(): StructuredQuery {
    return this._query.aggregate(this);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeAggregation(this._index);
  }

  canRemove(): boolean {
    return this.remove()
      .clean()
      .isValid();
  }

  /**
   * Returns the display name for the aggregation
   */
  displayName() {
    const displayName = this.options()["display-name"];
    if (displayName) {
      return displayName;
    }
    const aggregation = this.aggregation();
    if (aggregation.isCustom()) {
      return aggregation._query.formatExpression(aggregation);
    } else if (aggregation.isMetric()) {
      const metric = aggregation.metric();
      if (metric) {
        return metric.displayName();
      }
    } else if (aggregation.isStandard()) {
      const option = aggregation.option();
      if (option) {
        const aggregationName =
          option.columnName || option.name.replace(" of ...", "");
        const dimension = aggregation.dimension();
        if (dimension) {
          return t`${aggregationName} of ${dimension.render()}`;
        } else {
          return aggregationName;
        }
      }
    }
    return null;
  }

  /**
   * Returns the column name (non-deduplicated)
   */
  columnName() {
    const displayName = this.options()["display-name"];
    if (displayName) {
      return displayName;
    }
    const aggregation = this.aggregation();
    if (aggregation.isCustom()) {
      return "expression";
    } else if (aggregation.isMetric()) {
      const metric = aggregation.metric();
      if (metric) {
        // delegate to the metric's definition
        return metric.columnName();
      }
    } else if (aggregation.isStandard()) {
      const short = this.short();
      if (short) {
        // NOTE: special case for "distinct"
        return short === "distinct" ? "count" : short;
      }
    }
    return null;
  }

  short() {
    const aggregation = this.aggregation();
    // FIXME: if metric, this should be the underlying metric's short name?
    if (aggregation.isMetric()) {
      const metric = aggregation.metric();
      if (metric) {
        // delegate to the metric's definition
        return metric.aggregation().short();
      }
    } else if (aggregation.isStandard()) {
      return aggregation[0];
    }
  }

  baseType() {
    const short = this.short();
    return INTEGER_AGGREGATIONS.has(short) ? TYPE.Integer : TYPE.Float;
  }

  /**
   * Predicate function to test if a given aggregation clause is valid
   */
  isValid(): boolean {
    if (this.hasOptions()) {
      return this.aggregation().isValid();
    } else if (this.isStandard() && this.dimension()) {
      const dimension = this.dimension();
      const aggregationOperator = this.query()
        .table()
        .aggregationOperator(this[0]);
      return (
        aggregationOperator &&
        (!aggregationOperator.requiresField ||
          this.query()
            .aggregationFieldOptions(aggregationOperator)
            .hasDimension(dimension))
      );
    } else if (this.isMetric()) {
      return !!this.metric();
    } else {
      // FIXME: custom aggregation validation
      return true;
    }
  }

  // There are currently 3 "classes" of aggregations that are handled differently, "standard", "segment", and "custom"

  /**
   * Returns true if this is a "standard" metric
   */
  isStandard(): boolean {
    return AGGREGATION.isStandard(this);
  }

  /**
   * Returns true if this is a metric
   */
  isMetric(): boolean {
    return AGGREGATION.isMetric(this);
  }

  /**
   * Returns true if this is custom expression created with the expression editor
   */
  isCustom(): boolean {
    return AGGREGATION.isCustom(this);
  }

  // STANDARD AGGREGATION

  /**
   * Gets the aggregation option matching this aggregation
   * Returns `null` if the clause isn't a "standard" metric
   */
  option(): ?AggregationOperator {
    const operatorName = this.operatorName();
    if (this._query == null || !operatorName) {
      return null;
    }
    return this._query
      .aggregationOperators()
      .find(option => option.short === operatorName);
  }

  /**
   * Get the operator from a standard aggregation clause
   * Returns `null` if the clause isn't a "standard" metric
   */
  operatorName(): ?string {
    if (this.isStandard()) {
      return this[0];
    }
  }

  /**
   * Get the fieldId from a standard aggregation clause
   * Returns `null` if the clause isn't a "standard" metric
   */
  getFieldReference(): ?FieldId {
    if (this.isStandard()) {
      return this[1];
    }
  }

  /**
   * Gets the dimension for this this aggregation
   * Returns `null` if the clause isn't a "standard" metric
   */
  dimension(): ?Dimension {
    if (this.isStandard() && this.length > 1) {
      return this._query.parseFieldReference(this.getFieldReference());
    }
  }

  // METRIC AGGREGATION

  /**
   * Get metricId from a metric aggregation clause
   * Returns `null` if the clause doesn't represent a metric
   */
  metricId(): ?MetricId {
    if (this.isMetric()) {
      return this[1];
    }
  }

  metric() {
    if (this.isMetric()) {
      return this.metadata().metric(this.metricId());
    }
  }

  // OPTIONS

  hasOptions() {
    return this[0] === "aggregation-options";
  }

  options() {
    if (this.hasOptions()) {
      return this[2] || {};
    } else {
      return {};
    }
  }

  /**
   * Returns the aggregation without "aggregation-options" clause, if any
   */
  aggregation() {
    if (this.hasOptions()) {
      return new Aggregation(this[1], this._index, this._query);
    } else {
      return this;
    }
  }

  // MISC

  aggregationDimension() {
    return new AggregationDimension(
      null,
      [this._index],
      this._query.metadata(),
      this._query,
    );
  }

  isSortable() {
    return AGGREGATION.isSortable(this);
  }
}
