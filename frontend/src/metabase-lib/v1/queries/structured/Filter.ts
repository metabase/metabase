// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";

import { isExpression } from "metabase-lib/v1/expressions";
import {
  getFilterOptions,
  hasFilterOptions,
  isCustom,
  isFieldFilter,
  isStandard,
  setFilterOptions,
} from "metabase-lib/v1/queries/utils/filter";
import { getRelativeDatetimeField } from "metabase-lib/v1/queries/utils/query-time";
import type { Filter as FilterObject } from "metabase-types/api";

import type Dimension from "../../Dimension";
import type { FilterOperator } from "../../deprecated-types";
import type StructuredQuery from "../StructuredQuery";

import MBQLClause from "./MBQLClause";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Filter extends MBQLClause {
  /**
   * Replaces the filter in the parent query and returns the new StructuredQuery
   * or replaces itself in the parent query if no {filter} argument is provided.
   */
  replace(filter?: Filter | FilterObject): StructuredQuery {
    if (filter != null) {
      return this._query.updateFilter(this._index, filter);
    } else {
      return this._query.updateFilter(this._index, this);
    }
  }

  /**
   * Adds itself to the parent query and returns the new StructuredQuery
   */
  add(): StructuredQuery {
    return this._query.filter(this);
  }

  /**
   * Removes the filter in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeFilter(this._index);
  }

  /**
   * Returns true if the filter is valid
   */
  isValid() {
    if (this.isStandard()) {
      // has an operator name and dimension or expression
      const dimension = this.dimension().getMLv1CompatibleDimension();

      if (!dimension && isExpression(this[1])) {
        return true;
      }

      const query = this.legacyQuery({ useStructuredQuery: true });

      if (
        !dimension ||
        !(query && query.filterDimensionOptions().hasDimension(dimension))
      ) {
        return false;
      }

      if (!this.operatorName()) {
        return false;
      }
      const operator = this.operator();

      if (operator) {
        const args = this.arguments();

        // has the minimum number of arguments
        if (args.length < operator.fields.length) {
          return false;
        }

        // arguments are non-null/undefined
        if (!_.all(args, arg => arg != null)) {
          return false;
        }
      }

      return true;
    } else if (this.isCustom()) {
      return true;
    }

    return false;
  }

  // There are currently 3 "classes" of filters that are handled differently, "standard", "segment", and "custom"

  /**
   * Returns true if this is a "standard" filter
   */
  isStandard() {
    return isStandard(this);
  }

  /**
   * Returns true if this is custom filter created with the expression editor
   */
  isCustom() {
    return isCustom(this);
  }

  /**
   * Returns true for filters where the first argument is a field
   */
  isFieldFilter() {
    return isFieldFilter(this);
  }

  // FIELD FILTERS
  dimension(): Dimension | null | undefined {
    if (this.isFieldFilter()) {
      return this._query.parseFieldReference(this[1]);
    }
    const field = getRelativeDatetimeField(this);
    if (field) {
      return this._query.parseFieldReference(field);
    }
  }

  field() {
    const dimension = this.dimension();
    return dimension && dimension.field();
  }

  operatorName() {
    return this[0];
  }

  operator(opName = this.operatorName()): FilterOperator | null | undefined {
    const dimension = this.dimension();
    return dimension ? dimension.filterOperator(opName) : null;
  }

  filterOperators(selected: string): FilterOperator[] | null | undefined {
    const dimension = this.dimension();
    return dimension ? dimension.filterOperators(selected) : null;
  }

  arguments() {
    return hasFilterOptions(this) ? this.slice(2, -1) : this.slice(2);
  }

  options() {
    return getFilterOptions(this);
  }

  setOptions(options: any) {
    return this.set(setFilterOptions(this, options));
  }

  isDimension(otherDimension: Dimension) {
    const dimension = this.dimension();
    return dimension ? dimension.isEqual(otherDimension) : false;
  }

  isOperator(otherOperator: FilterOperator | string) {
    const operator = this.operator();
    const operatorName =
      typeof otherOperator === "string"
        ? otherOperator
        : otherOperator && otherOperator.name;
    return operator && operator.name === operatorName;
  }
}
