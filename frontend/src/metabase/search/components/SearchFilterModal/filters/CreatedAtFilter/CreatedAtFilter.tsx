/* eslint-disable react/prop-types */
import { useRef, useState } from "react";
import { t } from "ttag";
import { SearchFilterComponent } from "metabase/search/types";
import {
  filterToUrlEncoded,
  getFilterTitle,
} from "metabase/parameters/utils/date-formatting";
import Popover from "metabase/components/Popover";
import DatePicker, {
  DATE_OPERATORS,
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { CreatedAtButton } from "metabase/search/components/SearchFilterModal/filters/CreatedAtFilter/CreatedAtFilter.styled";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

const CREATED_AT_FILTERS = DATE_OPERATORS.filter(({name}) => name !== 'exclude');
console.log(CREATED_AT_FILTERS);

export const CreatedAtFilter: SearchFilterComponent<"created_at"> = ({
  value = [],
  onChange,
}) => {
  const ref = useRef(null);

  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, null) || [] : [],
  );

  const [openPopover, setOpenPopover] = useState(false);

  const onFilterChange = (filter: any[]) => {
    const encodedFilter = filterToUrlEncoded(filter);
    if (encodedFilter) {
      onChange([encodedFilter]);
    }
    setFilter(filter);
  };

  const onCommit = (filter: any[]) => {
    onFilterChange(filter);
    setOpenPopover(false);
  };

  return (
    <div ref={ref}>
      <CreatedAtButton onClick={() => setOpenPopover(!openPopover)} fullWidth>
        {filter.length > 0 ? getFilterTitle(filter) : t`Anytime`}
      </CreatedAtButton>
      <Popover
        isOpen={openPopover}
        target={ref.current}
        onClose={() => setOpenPopover(false)}
      >
        <DatePicker
          filter={filter}
          onCommit={onCommit}
          onFilterChange={onFilterChange}
          operators={CREATED_AT_FILTERS}
        />
      </Popover>
    </div>
  );
};
