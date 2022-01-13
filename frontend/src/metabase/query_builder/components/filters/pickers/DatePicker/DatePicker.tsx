import React, { useState } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import { Root } from "./DatePicker.styled";
import { DatePickerOptionsList } from "./DatePickerOptionsList";
import { OnFilterChange, PredefinedFilter, DatePickerView } from "./constants";
import { getPredefinedFilter } from "./utils";

type Props = {
  filter: Filter;
  onFilterChange: OnFilterChange;
  className?: string;
};

export function DatePicker({ filter, onFilterChange }: Props) {
  const [view, setView] = useState(DatePickerView.DEFAULT);

  const onPredefinedFilterClick = (filterId: PredefinedFilter) => {
    const { operator, arguments: args } = getPredefinedFilter(filterId);
    const newFilter = filter.setOperator(operator).setArguments(args);
    onFilterChange(newFilter, true);
  };

  let content: JSX.Element;
  switch (view) {
    case DatePickerView.DEFAULT:
      content = (
        <DatePickerOptionsList
          onPredefinedFilterClick={onPredefinedFilterClick}
          onCustomFilterClick={setView}
        />
      );
      break;
    case DatePickerView.RELATIVE_PAST:
    case DatePickerView.RELATIVE_CURRENT:
    case DatePickerView.RELATIVE_NEXT:
      content = <div>Relative view</div>;
      break;
    case DatePickerView.SPECIFIC_BETWEEN:
    case DatePickerView.SPECIFIC_BEFORE:
    case DatePickerView.SPECIFIC_AFTER:
    case DatePickerView.SPECIFIC_ON:
      content = <div>Specific view</div>;
      break;
    case DatePickerView.EXCLUDE:
      content = <div>Exclude view</div>;
      break;
    default: {
      const missingView: never = view;
      throw new Error(`Unknown view: ${missingView}`);
    }
  }

  return <Root>{content}</Root>;
}
