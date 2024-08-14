/* eslint-disable react/prop-types */
import { t, ngettext, msgid } from "ttag";

import Value from "metabase/components/Value";
import { color } from "metabase/lib/colors";
import ViewPill from "metabase/query_builder/components/view/ViewPill";
import { getFilterArgumentFormatOptions } from "metabase-lib/v1/operators/utils";
import { getFilterDimension } from "metabase-lib/v1/queries/utils/dimension";
import { hasFilterOptions } from "metabase-lib/v1/queries/utils/filter";
import { generateTimeFilterValuesDescriptions } from "metabase-lib/v1/queries/utils/query-time";

const DEFAULT_FILTER_RENDERER = ({ field, operator, values }) => {
  const items = [field, operator, ...values];
  // insert an "and" at the end if multiple values
  // NOTE: works for "between", not sure about others
  if (values.length > 1) {
    items.splice(items.length - 1, 0, "and");
  }
  return (
    <span>
      {items
        .filter(f => f)
        .map((item, index, array) => (
          <span key={index}>
            {item}
            {index < array.length - 1 ? " " : null}
          </span>
        ))}
    </span>
  );
};

const FilterPill = props => <ViewPill color={color("filter")} {...props} />;

export const SimpleOperatorFilter = ({
  filter,
  metadata,
  maxDisplayValues,
  children = DEFAULT_FILTER_RENDERER,
}) => {
  const [op] = filter;
  const values = hasFilterOptions(filter)
    ? filter.slice(2, -1)
    : filter.slice(2);

  const dimension = getFilterDimension(filter, metadata);
  if (!dimension) {
    return null;
  }

  const operator = dimension.filterOperator(op);

  let formattedValues;
  if (operator && operator.multi && values.length > maxDisplayValues) {
    const n = values.length;
    formattedValues = [ngettext(msgid`${n} selection`, `${n} selections`, n)];
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
    field: dimension.displayName(),
    operator: operator && operator.moreVerboseName,
    values: formattedValues,
  });
};

export const ComplexOperatorFilter = ({ index, filter, removeFilter }) => {
  return (
    <FilterPill onRemove={() => removeFilter(index)}>
      {filter.displayName()}
    </FilterPill>
  );
};

export const OperatorFilter = ({ filter, ...props }) =>
  filter.displayName ? (
    <ComplexOperatorFilter filter={filter} {...props} />
  ) : (
    <SimpleOperatorFilter filter={filter} {...props} />
  );

export const SegmentFilter = ({
  filter,
  metadata,
  children = DEFAULT_FILTER_RENDERER,
}) => {
  const segment = metadata.segment(filter[1]);
  return children({
    operator: t`Matches`,
    values: segment ? [segment.name] : [],
  });
};

/**
 * @deprecated use MLv2
 */
export const Filter = ({ filter, ...props }) =>
  filter[0] === "segment" ? (
    <SegmentFilter filter={filter} {...props} />
  ) : (
    <OperatorFilter filter={filter} {...props} />
  );
