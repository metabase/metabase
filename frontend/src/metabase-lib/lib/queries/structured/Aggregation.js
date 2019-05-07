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
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(aggregation: AggregationObject | Aggregation): StructuredQuery {
    return this._query.updateAggregation(this._index, aggregation);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeAggregation(this._index);
  }

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
   * Predicate function to test if a given aggregation clause is fully formed
   */
  isValid(): boolean {
    return AggregationClause_DEPRECATED.isValid(this);
  }

  /**
   * Predicate function to test if a given aggregation clause represents a standard aggregation
   */
  isStandard(): boolean {
    return AggregationClause_DEPRECATED.isStandard(this);
  }

  /**
   * Predicate function to test if a given aggregation clause represents a metric
   */
  isMetric(): boolean {
    return AggregationClause_DEPRECATED.isMetric(this);
  }

  /**
   * Is a custom expression created with the expression editor
   */
  isCustom(): boolean {
    return AggregationClause_DEPRECATED.isCustom(this);
  }

  getAggregation() {
    return AggregationClause_DEPRECATED.getAggregation(this);
  }

  isNamed() {
    return NamedClause_DEPRECATED.isNamed(this);
  }

  /**
   * Get metricId from a metric aggregation clause
   * Returns `null` if the clause doesn't represent a metric
   */
  getMetric(): ?MetricId {
    return AggregationClause_DEPRECATED.getMetric(this);
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
}
