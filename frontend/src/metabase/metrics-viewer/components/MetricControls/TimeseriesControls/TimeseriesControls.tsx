import type { DatePickerValue } from "metabase/querying/common/types";
import { Divider } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type { ProjectionInfo } from "../../../utils/queries";
import { BucketButton } from "../BucketButton";
import { FilterButton } from "../FilterButton";

import S from "./TimeseriesControls.module.css";

type TimeseriesControlsProps = {
  definition: MetricDefinition;
  projectionInfo: ProjectionInfo;
  onFilterChange: (value: DatePickerValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
};

export function TimeseriesControls({
  definition,
  projectionInfo,
  onFilterChange,
  onTemporalUnitChange,
}: TimeseriesControlsProps) {
  const {
    projection,
    projectionDimension,
    filterDimension,
    filter,
    isTemporalBucketable,
  } = projectionInfo;

  if (!projection || !projectionDimension || !filterDimension) {
    return null;
  }

  return (
    <>
      <FilterButton
        definition={definition}
        filterDimension={filterDimension}
        filter={filter}
        onChange={onFilterChange}
      />
      {isTemporalBucketable && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <BucketButton
            definition={definition}
            dimension={projectionDimension}
            projection={projection}
            onChange={onTemporalUnitChange}
          />
        </>
      )}
    </>
  );
}
