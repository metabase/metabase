import { t } from "ttag";

import type { RelativeIntervalDirection } from "metabase/querying/common/types";
import { StatusFilterWidget } from "metabase/transforms/pages/RunListPage/RunFilterBar/StatusFilterWidget";
import { TimeFilterWidget } from "metabase/transforms/pages/RunListPage/RunFilterBar/TimeFilterWidget";
import { TransformFilterWidget } from "metabase/transforms/pages/RunListPage/RunFilterBar/TransformFilterWidget";
import { Group } from "metabase/ui";
import type {
  Transform,
  TransformGraphRunType,
  TransformId,
  TransformRunStatus,
} from "metabase-types/api";

import type { TransformGraphRunFilterOptions } from "../types";

import { TypeFilterWidget } from "./TypeFilterWidget";

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

type TransformGraphRunFilterBarProps = {
  filterOptions: TransformGraphRunFilterOptions;
  transforms: Transform[];
  onFilterOptionsChange: (
    filterOptions: TransformGraphRunFilterOptions,
  ) => void;
};

export function TransformGraphRunFilterBar({
  filterOptions,
  transforms,
  onFilterOptionsChange,
}: TransformGraphRunFilterBarProps) {
  const handleTypesChange = (types: TransformGraphRunType[]) => {
    onFilterOptionsChange({ ...filterOptions, types });
  };

  const handleTransformsChange = (transformIds: TransformId[]) => {
    onFilterOptionsChange({ ...filterOptions, transformIds });
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    onFilterOptionsChange({ ...filterOptions, statuses });
  };

  const handleStartTimeChange = (startTime: string | undefined) => {
    onFilterOptionsChange({ ...filterOptions, startTime });
  };

  return (
    <Group>
      <TypeFilterWidget
        types={filterOptions.types ?? []}
        onChange={handleTypesChange}
      />
      <TransformFilterWidget
        transformIds={filterOptions.transformIds ?? []}
        transforms={transforms}
        onChange={handleTransformsChange}
      />
      <TimeFilterWidget
        label={t`Started at`}
        value={filterOptions.startTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleStartTimeChange}
      />
      <StatusFilterWidget
        label={t`Status`}
        statuses={filterOptions.statuses ?? []}
        onChange={handleStatusesChange}
      />
    </Group>
  );
}
