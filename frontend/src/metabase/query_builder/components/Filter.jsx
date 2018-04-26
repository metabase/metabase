/* @flow */

import React from "react";

import FieldName from "./FieldName.jsx";
import Value from "metabase/components/Value";

import Dimension from "metabase-lib/lib/Dimension";

import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { hasFilterOptions } from "metabase/lib/query/filter";
import { getFilterArgumentFormatOptions } from "metabase/lib/schema_metadata";

import { t } from "c-3po";

import type { Filter as FilterType } from "metabase/meta/types/Query";
import type { Value as ValueType } from "metabase/meta/types/Dataset";
import Metadata from "metabase-lib/lib/metadata/Metadata";

export type FilterRenderer = ({
  field?: ?React$Element<any>,
  operator: ?string,
  values: (React$Element<any> | string)[],
}) => React$Element<any>;

type Props = {
  filter: FilterType,
  metadata: Metadata,
  maxDisplayValues?: number,
  children?: FilterRenderer,
};

const DEFAULT_FILTER_RENDERER: FilterRenderer = ({
  field,
  operator,
  values,
}) => {
  const items = [field, operator, ...values];
  // insert an "and" at the end if multiple values
  // NOTE: works for "between", not sure about others
  if (values.length > 1) {
    items.splice(items.length - 1, 0, "and");
  }
  return (
    <span>
      {items.filter(f => f).map((item, index, array) => (
        <span>
          {item}
          {index < array.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
};

export const OperatorFilter = ({
  filter,
  metadata,
  maxDisplayValues,
  children = DEFAULT_FILTER_RENDERER,
}: Props) => {
  let [op, field] = filter;
  // $FlowFixMe
  let values: ValueType[] = hasFilterOptions(filter)
    ? filter.slice(2, -1)
    : filter.slice(2);

  const dimension = Dimension.parseMBQL(field, metadata);
  if (!dimension) {
    return null;
  }

  const operator = dimension.operator(op);

  let formattedValues;
  // $FlowFixMe: not understanding maxDisplayValues is provided by defaultProps
  if (operator && operator.multi && values.length > maxDisplayValues) {
    formattedValues = [values.length + " selections"];
  } else if (dimension.field().isDate() && !dimension.field().isTime()) {
    formattedValues = generateTimeFilterValuesDescriptions(filter);
  } else {
    const valuesWithOptions = values.map((value, index) => [
      value,
      getFilterArgumentFormatOptions(operator, index),
    ]);
    formattedValues = valuesWithOptions
      .filter(([value, options]) => value !== undefined && !options.hide)
      .map(([value, options], index) => (
        <Value
          key={index}
          value={value}
          column={dimension.field()}
          remap
          {...options}
        />
      ));
  }
  return children({
    field: <FieldName field={field} tableMetadata={dimension.field().table} />,
    operator: operator && operator.moreVerboseName,
    values: formattedValues,
  });
};

export const SegmentFilter = ({
  filter,
  metadata,
  maxDisplayValues,
  children = DEFAULT_FILTER_RENDERER,
}: Props) => {
  const segment = metadata.segment(filter[1]);
  return children({
    operator: t`Matches`,
    values: segment ? [segment.name] : [],
  });
};

const Filter = ({ filter, ...props }: Props) =>
  filter[0] === "SEGMENT" ? (
    <SegmentFilter filter={filter} {...props} />
  ) : (
    <OperatorFilter filter={filter} {...props} />
  );

export default Filter;
