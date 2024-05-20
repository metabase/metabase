// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t } from "ttag";

import type { AggregationOperator } from "metabase-lib/v1/deprecated-types";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import * as AGGREGATION from "metabase-lib/v1/queries/utils/aggregation";
import { TYPE } from "metabase-lib/v1/types/constants";
import type {
  Aggregation as AggregationObject,
  FieldId,
} from "metabase-types/api";

import type Dimension from "../../Dimension";
import { AggregationDimension } from "../../Dimension";
import type StructuredQuery from "../StructuredQuery";

import MBQLClause from "./MBQLClause";

const INTEGER_AGGREGATIONS = new Set(["count", "cum-count", "distinct"]);
const ORIGINAL_FIELD_TYPE_AGGREGATIONS = new Set([
  "sum",
  "cum-sum",
  "min",
  "max",
]);

// eslint-disable-next-line import/no-default-export -- deprecated usage
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

    if (aggregation.isStandard()) {
      return aggregation[0];
    }
  }

  baseType() {
    const short = this.short();
    if (INTEGER_AGGREGATIONS.has(short)) {
      return TYPE.Integer;
    }

    const field = this.dimension()?.field();
    if (ORIGINAL_FIELD_TYPE_AGGREGATIONS.has(short) && field) {
      return field.base_type;
    }

    return TYPE.Float;
  }

  /**
   * Predicate function to test if a given aggregation clause is valid
   */
  isValid() {
    return true;
  }

  // There are currently 3 "classes" of aggregations that are handled differently, "standard", "segment", and "custom"

  /**
   * Returns true if this is a "standard" metric
   */
  isStandard() {
    return AGGREGATION.isStandard(this);
  }

  /**
   * Returns true if this is custom expression created with the expression editor
   */
  isCustom() {
    return AGGREGATION.isCustom(this);
  }

  // STANDARD AGGREGATION

  /**
   * Gets the aggregation option matching this aggregation
   * Returns `null` if the clause isn't a "standard" metric
   */
  option(): AggregationOperator | null | undefined {
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
  operatorName(): string | null {
    if (this.isStandard()) {
      return this[0];
    }

    return null;
  }

  expressionName(): string | null {
    if (this.isCustom()) {
      return this[0];
    }
  }

  /**
   * Get the fieldId from a standard aggregation clause
   * Returns `null` if the clause isn't a "standard" metric
   */
  getFieldReference(): FieldId | null | undefined {
    if (this.isStandard()) {
      return this[1];
    }
  }

  /**
   * Gets the dimension for this this aggregation
   * Returns `null` if the clause isn't a "standard" metric
   */
  dimension(): Dimension | null | undefined {
    if (this.isStandard() && this.length > 1) {
      const dimension = this._query.parseFieldReference(
        this.getFieldReference(),
      );
      return dimension?.getMLv1CompatibleDimension?.();
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
  aggregation(): Aggregation {
    if (this.hasOptions()) {
      return new Aggregation(this[1], this._index, this._query);
    } else {
      return this;
    }
  }

  filters(): Filter[] {
    if (this.isCustom()) {
      const filter = this.customFilter();
      return filter ? [filter] : [];
    }

    return [];
  }

  customFilter(): Filter | null {
    if (this.isCustom()) {
      switch (this.expressionName()) {
        case "share":
        case "count-where":
          return new Filter(
            this[1],
            null,
            this.legacyQuery({ useStructuredQuery: true }),
          );
        case "sum-where":
          return new Filter(
            this[2],
            null,
            this.legacyQuery({ useStructuredQuery: true }),
          );
      }
    }

    return null;
  }

  // MISC
  aggregationDimension() {
    return new AggregationDimension(
      this._index,
      null,
      this._query.metadata(),
      this._query,
    );
  }
}
