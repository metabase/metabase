import { useCallback } from "react";

import { getDatePickerValue } from "metabase/querying/filters/utils/dates";
import { Divider } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";
import type { DatePickerValue } from "metabase/querying/common/types";

import { STAGE_INDEX } from "../../../constants";
import { BucketButton } from "../BucketButton";
import { FilterButton } from "../FilterButton";
import type { BreakoutInfo } from "../../../utils/queries";

import S from "./TimeseriesControls.module.css";

type TimeseriesControlsProps = {
  query: Lib.Query;
  breakoutInfo: BreakoutInfo;
  onFilterChange: (value: DatePickerValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
};

export function TimeseriesControls({
  query,
  breakoutInfo,
  onFilterChange,
  onTemporalUnitChange,
}: TimeseriesControlsProps) {
  const {
    breakout,
    breakoutColumn,
    filterColumn,
    filter,
    isTemporalBucketable,
  } = breakoutInfo;

  const handleFilterChange = useCallback(
    (newFilter: Lib.ExpressionClause | undefined) => {
      if (newFilter && filterColumn) {
        const value = getDatePickerValue(query, STAGE_INDEX, newFilter);
        onFilterChange(value);
      } else {
        onFilterChange(undefined);
      }
    },
    [query, filterColumn, onFilterChange],
  );

  if (!breakout || !breakoutColumn || !filterColumn) {
    return null;
  }

  return (
    <>
      <FilterButton
        query={query}
        column={filterColumn}
        filter={filter}
        onChange={handleFilterChange}
      />
      {isTemporalBucketable && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <BucketButton
            query={query}
            column={breakoutColumn}
            breakout={breakout}
            onChange={onTemporalUnitChange}
          />
        </>
      )}
    </>
  );
}
