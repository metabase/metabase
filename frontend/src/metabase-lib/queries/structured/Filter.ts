// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";
import type {
  Filter as FilterObject,
  FieldFilter,
  FieldReference,
} from "metabase-types/api";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { parseTimestamp } from "metabase/lib/time";
import { isExpression } from "metabase-lib/expressions";
import { getFilterArgumentFormatOptions } from "metabase-lib/operators/utils";
import {
  generateTimeFilterValuesDescriptions,
  getRelativeDatetimeField,
  isStartingFrom,
} from "metabase-lib/queries/utils/query-time";
import {
  isStandard,
  isSegment,
  isCustom,
  isFieldFilter,
  hasFilterOptions,
  getFilterOptions,
  setFilterOptions,
} from "metabase-lib/queries/utils/filter";
import type { FilterOperator } from "../../deprecated-types";
import type Dimension from "../../Dimension";
import type StructuredQuery from "../StructuredQuery";
import MBQLClause from "./MBQLClause";

interface FilterDisplayNameOpts {
  includeDimension?: boolean;
  includeOperator?: boolean;
}

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
   * Returns the array of arguments as dates if they are specific dates, and returns their temporal unit.
   */
  specificDateArgsAndUnit() {
    const field = this.dimension()?.field();
    const isSpecific = ["=", "between", "<", ">"].includes(this.operatorName());
    if ((field?.isDate() || field?.isTime()) && isSpecific) {
      const args = this.arguments();
      const dates = args.map(d => parseTimestamp(d));
      if (dates.every(d => d.isValid())) {
        const detectedUnit = dates.some(d => d.minutes())
          ? "minute"
          : dates.some(d => d.hours())
          ? "hour"
          : "day";
        const unit = this.dimension()?.temporalUnit() ?? detectedUnit;
        return [dates, unit];
      }
    }
    return [undefined, undefined];
  }

  /**
   * Returns the display name for the filter
   */
  displayName({
    includeDimension = true,
    includeOperator = true,
  }: FilterDisplayNameOpts = {}) {
    if (this.isSegment()) {
      const segment = this.segment();
      return segment ? segment.displayName() : t`Unknown Segment`;
    } else if (this.isStandard()) {
      if (isStartingFrom(this)) {
        includeOperator = false;
      }
      const [dates, dateUnit] = this.specificDateArgsAndUnit();
      const origOp = this.operatorName();
      const dateRangeStr =
        dates &&
        ["=", "between"].includes(origOp) &&
        formatDateTimeRangeWithUnit(dates, dateUnit, { type: "tooltip" });
      const op = dateRangeStr ? "=" : origOp;
      return [
        includeDimension && this.dimension()?.displayName(),
        includeOperator && this.operator(op)?.moreVerboseName,
        dateRangeStr || this.formattedArguments().join(" "),
      ]
        .map(s => s || "")
        .join(" ");
    } else if (this.isCustom()) {
      return this._query.formatExpression(this);
    } else {
      return t`Unknown Filter`;
    }
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

      const query = this.query();

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
    } else if (this.isSegment()) {
      return !!this.segment();
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
   * Returns true if this is a segment
   */
  isSegment() {
    return isSegment(this);
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

  // SEGMENT FILTERS
  segmentId() {
    if (this.isSegment()) {
      return this[1];
    }
  }

  segment() {
    if (this.isSegment()) {
      return this.metadata().segment(this.segmentId());
    }
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

  setOperator(operatorName: string) {
    const dimension = this.dimension();
    const operator = dimension && dimension.filterOperator(operatorName);
    const filter: FieldFilter = [operatorName, dimension && dimension.mbql()];

    if (operator) {
      for (let i = 0; i < operator.fields.length; i++) {
        if (operator.fields[i].default !== undefined) {
          filter.push(operator.fields[i].default);
        } else {
          filter.push(undefined);
        }
      }

      if (operator.optionsDefaults) {
        filter.push(operator.optionsDefaults);
      }

      const oldOperator = this.operator();
      const oldFilter = this;

      if (oldOperator) {
        // copy over values of the same type
        for (let i = 0; i < oldFilter.length - 2; i++) {
          const field = operator.multi
            ? operator.fields[0]
            : operator.fields[i];
          const oldField = oldOperator.multi
            ? oldOperator.fields[0]
            : oldOperator.fields[i];

          if (
            field &&
            oldField &&
            field.type === oldField.type &&
            oldFilter[i + 2] !== undefined
          ) {
            filter[i + 2] = oldFilter[i + 2];
          }
        }
      }
    }

    return this.set(filter);
  }

  setDimension(
    fieldRef: FieldReference | null | undefined,
    {
      useDefaultOperator = false,
    }: {
      useDefaultOperator?: boolean;
    } = {},
  ): Filter {
    if (!fieldRef) {
      return this.set([]);
    }

    const dimension = this._query.parseFieldReference(fieldRef);

    if (
      dimension &&
      (!this.isFieldFilter() || !dimension.isEqual(this.dimension()))
    ) {
      const operator = // see if the new dimension supports the existing operator
        dimension.filterOperator(this.operatorName()) || // otherwise use the default operator, if enabled
        (useDefaultOperator && dimension.defaultFilterOperator());
      const operatorName = operator && operator.name;
      const filter: Filter = this.set(
        this.isFieldFilter()
          ? [this[0], dimension.mbql(), ...this.slice(2)]
          : [null, dimension.mbql()],
      );

      if (operatorName && filter.operatorName() !== operatorName) {
        return filter.setOperator(operatorName);
      } else {
        return filter;
      }
    }

    return this;
  }

  setArgument(index: number, value: any) {
    return this.set([
      ...this.slice(0, index + 2),
      value,
      ...this.slice(index + 3),
    ]);
  }

  setArguments(values: any[]) {
    return this.set([...this.slice(0, 2), ...values]);
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

  formattedArguments(maxDisplayValues?: number = 1) {
    const dimension = this.dimension();
    const operator = this.operator();
    const args = this.arguments();

    if (operator && operator.multi && args.length > maxDisplayValues) {
      const n = args.length;
      return [ngettext(msgid`${n} selection`, `${n} selections`, n)];
    } else if (
      dimension &&
      dimension.field().isDate() &&
      !dimension.field().isTime()
    ) {
      return generateTimeFilterValuesDescriptions(this);
    } else {
      return args
        .map((value, index) => [
          value,
          getFilterArgumentFormatOptions(operator, index),
        ])
        .filter(([value, options]) => value !== undefined && !options.hide)
        .map(
          (
            [value, _options],
            _index, // FIXME: remapping
          ) => value, // <Value
          //   key={index}
          //   value={value}
          //   column={dimension.field()}
          //   remap
          //   {...options}
          // />
        );
    }
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
