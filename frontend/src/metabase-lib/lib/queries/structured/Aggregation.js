/* @flow */

import MBQLClause from "./MBQLClause";

import { t } from "ttag";

import {
  AggregationClause as AggregationClause_DEPRECATED,
  NamedClause as NamedClause_DEPRECATED,
} from "metabase/lib/query";

import type { Aggregation as AggregationObject } from "metabase/meta/types/Query";
import type StructuredQuery from "../StructuredQuery";
import type Dimension from "../../Dimension";
import type { AggregationOption } from "metabase/meta/types/Metadata";
import type { MetricId } from "metabase/meta/types/Metric";
import type { FieldId } from "metabase/meta/types/Field";

export default class Aggregation extends MBQLClause {
  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   * or replaces itself in the parent query if no {aggregation} argument is provided.
   */
  replace(aggregation?: AggregationObject | Aggregation): StructuredQuery {
    if (arguments.length > 0) {
      return this._query.updateAggregation(this._index, aggregation);
    } else {
      return this._query.updateAggregation(this._index, this);
    }
  }

  /**
   * Adds itself to the parent query and returns the new StructuredQuery
   */
  add(): StructuredQuery {
    return this._query.addAggregation(this);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeAggregation(this._index);
  }

  /**
   * Returns the display name for the aggregation
   */
  displayName() {
    if (this.isNamed()) {
      return NamedClause_DEPRECATED.getName(this);
    } else if (this.isCustom()) {
      return this._query.formatExpression(this);
    } else if (this.isMetric()) {
      const metric = this.metadata().metric(this.getMetric());
      if (metric) {
        return metric.displayName();
      }
    } else if (this.isStandard()) {
      const option = this.getOption();
      if (option) {
        const aggregationName = option.name.replace(" of ...", "");
        const dimension = this.dimension();
        if (dimension) {
          return t`${aggregationName} of ${dimension.displayName()}`;
        } else {
          return aggregationName;
        }
      }
    }
    return null;
  }

  /**
   * Predicate function to test if a given aggregation clause is valid
   */
  isValid(): boolean {
    if (!AggregationClause_DEPRECATED.isValid(this)) {
      return false;
    }
    if (this.isStandard()) {
      const dimension = this.dimension();
      const aggregation = this.query()
        .table()
        .aggregation(this[0]);
      return (
        aggregation &&
        (!aggregation.requiresField ||
          this.query()
            .aggregationFieldOptions(aggregation)
            .hasDimension(dimension))
      );
    }
    return true;
  }

  /**
   * Returns true if this is a "standard" metric
   */
  isStandard(): boolean {
    return AggregationClause_DEPRECATED.isStandard(this);
  }

  /**
   * Returns true if this is a metric
   */
  isMetric(): boolean {
    return AggregationClause_DEPRECATED.isMetric(this);
  }

  /**
   * Returns true if this is custom expression created with the expression editor
   */
  isCustom(): boolean {
    return AggregationClause_DEPRECATED.isCustom(this);
  }

  /**
   * Returns true if this a named aggregation
   */
  isNamed() {
    return NamedClause_DEPRECATED.isNamed(this);
  }

  // STANDARD AGGREGATION

  dimension(): ?Dimension {
    if (this.isStandard() && this.length > 1) {
      return this._query.parseFieldReference(this.getFieldReference());
    }
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
   * Get the operator from a standard aggregation clause
   * Returns `null` if the clause isn't in a standard format
   */
  getOperator(): ?string {
    return AggregationClause_DEPRECATED.getOperator(this);
  }

  /**
   * Get the fieldId from a standard aggregation clause
   * Returns `null` if the clause isn't in a standard format
   */
  getFieldReference(): ?FieldId {
    return AggregationClause_DEPRECATED.getField(this);
  }

  // METRIC AGGREGATION

  /**
   * Get metricId from a metric aggregation clause
   * Returns `null` if the clause doesn't represent a metric
   */
  getMetric(): ?MetricId {
    return AggregationClause_DEPRECATED.getMetric(this);
  }

  // NAMED

  getAggregation() {
    return AggregationClause_DEPRECATED.getAggregation(this);
  }
}
