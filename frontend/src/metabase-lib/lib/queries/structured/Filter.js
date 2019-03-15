/* @flow */

import MBQLClause from "./MBQLClause";

import type { Filter as FilterObject } from "metabase/meta/types/Query";
import type StructuredQuery from "../StructuredQuery";
import type Dimension from "../../Dimension";

import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import {
  isSegmentFilter,
  isCompoundFilter,
  isFieldFilter,
  hasFilterOptions
} from "metabase/lib/query/filter";
import { getFilterArgumentFormatOptions } from "metabase/lib/schema_metadata";

import { t, ngettext, msgid } from "c-3po";

type FilterOperator = {
  name: string, // MBQL filter clause
};

export default class Filter extends MBQLClause {
  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(filter: Filter | FilterObject): StructuredQuery {
    return this._query.updateFilter(this._index, filter);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeFilter(this._index);
  }

  segmentId() {
    if (this.isSegmentFilter()) {
      return this[1];
    }
  }

  segment() {
    if (this.isSegmentFilter()) {
      return this.metadata().segment(this.segmentId());
    }
  }

  dimension(): ?Dimension {
    if (this.isFieldFilter()) {
      return this._query.parseFieldReference(this[1]);
    }
  }

  field() {
    const dimension = this.dimension();
    return dimension && dimension.field();
  }

  operator(): ?FilterOperator {
    const dimension = this.dimension();
    return dimension ? dimension.operator(this[0]) : null;
  }

  operatorOptions(): ?(FilterOperator[]) {
    const field = this.field();
    return field ? field.operators : null;
  }

  arguments() {
    return hasFilterOptions(this) ? this.slice(2, -1) : this.slice(2);
  }

  formattedArguments(maxDisplayValues = 1) {
    const dimension = this.dimension();
    const operator = this.operator();
    const args = this.arguments();
    // $FlowFixMe: not understanding maxDisplayValues is provided by defaultProps
    if (operator && operator.multi && args.length > maxDisplayValues) {
      const n = args.length;
      return [ngettext(msgid`${n} selection`, `${n} selections`, n)];
    } else if (dimension.field().isDate() && !dimension.field().isTime()) {
      return generateTimeFilterValuesDescriptions(this);
    } else {
      return args
        .map((value, index) => [
          value,
          getFilterArgumentFormatOptions(operator, index),
        ])
        .filter(([value, options]) => value !== undefined && !options.hide)
        .map(
          ([value, options], index) =>
            // FIXME: remapping
            value,
          // <Value
          //   key={index}
          //   value={value}
          //   column={dimension.field()}
          //   remap
          //   {...options}
          // />
        );
    }
  }

  isDimension(otherDimension: Dimension): boolean {
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

  isSegmentFilter() {
    return isSegmentFilter(this);
  }

  isCompoundFilter() {
    return isCompoundFilter(this);
  }

  isFieldFilter() {
    return isFieldFilter(this);
  }

  displayName() {
    if (this.isSegmentFilter()) {
      const segment = this.segment();
      return t`Matches ${segment ? segment.displayName() : t`Unknown Segment`}`;
    } else if (this.isFieldFilter()) {
      const dimension = this.dimension();
      const operator = this.operator();
      const dimensionName = dimension && dimension.displayName();
      const operatorName = operator && operator.moreVerboseName;
      const argumentNames = this.formattedArguments().join(" ");
      return t`${dimensionName || ""} ${operatorName || ""} ${argumentNames}`;
    } else {
      return t`Unknown Filter`;
    }
  }
}
