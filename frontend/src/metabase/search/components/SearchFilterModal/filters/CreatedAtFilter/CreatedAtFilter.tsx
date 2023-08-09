/* eslint-disable react/prop-types */
import { useRef, useState } from "react";
import { t } from "ttag";
import { SearchFilterComponent } from "metabase/search/types";
import {
  filterToUrlEncoded,
  getFilterTitle,
} from "metabase/parameters/utils/date-formatting";
import Button from "metabase/core/components/Button";
import Popover from "metabase/components/Popover";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";

export const CreatedAtFilter: SearchFilterComponent<"created_at"> = ({
  value = [],
  onChange,
}) => {
  const ref = useRef(null);

  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, null) || [] : [],
  );

  const [openPopover, setOpenPopover] = useState(false);
  const onChangeThings = (filter: any[]) => {
    const encodedFilter = filterToUrlEncoded(filter);
    if (encodedFilter) {
      onChange([encodedFilter]);
    }
    setFilter(filter);
  };

  return (
    <div ref={ref}>
      <Button onClick={() => setOpenPopover(!openPopover)} fullWidth>
        {filter.length > 0 ? getFilterTitle(filter) : t`Anytime`}
      </Button>
      <Popover isOpen={openPopover} target={ref.current}>
        <DatePicker
          filter={filter}
          onCommit={onChangeThings}
          onFilterChange={onChangeThings}
        />
      </Popover>
    </div>
  );
};
