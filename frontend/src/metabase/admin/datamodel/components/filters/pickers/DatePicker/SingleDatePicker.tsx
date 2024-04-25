import type { SelectAll } from "metabase/components/Calendar";
import type Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  clearDateFilterTime,
  getDateFilterValue,
  setDateFilterValue,
} from "metabase-lib/v1/queries/utils/date-filters";

import SpecificDatePicker from "./SpecificDatePicker";

export type SingleDatePickerProps = {
  className?: string;
  filter: Filter;
  selectAll?: SelectAll;
  primaryColor?: string;
  hideTimeSelectors?: boolean;
  onFilterChange: (filter: any[]) => void;
};

const SingleDatePicker = ({
  className,
  filter,
  onFilterChange,
  hideTimeSelectors,
  selectAll,
  primaryColor,
}: SingleDatePickerProps) => (
  <SpecificDatePicker
    className={className}
    value={getDateFilterValue(filter)}
    primaryColor={primaryColor}
    selectAll={selectAll}
    onChange={value => onFilterChange(setDateFilterValue(filter, value))}
    onClear={() => onFilterChange(clearDateFilterTime(filter))}
    autoFocus
    hasCalendar
    hideTimeSelectors={hideTimeSelectors}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SingleDatePicker;
