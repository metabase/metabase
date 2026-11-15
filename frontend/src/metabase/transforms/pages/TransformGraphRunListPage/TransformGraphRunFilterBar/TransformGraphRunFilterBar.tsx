import { t } from "ttag";

import type { RelativeIntervalDirection } from "metabase/querying/common/types";
import { RunMethodFilterWidget } from "metabase/transforms/components/RunMethodFilterWidget";
import { StatusFilterWidget } from "metabase/transforms/components/StatusFilterWidget";
import { TimeFilterWidget } from "metabase/transforms/components/TimeFilterWidget";
import { TransformFilterWidget } from "metabase/transforms/components/TransformFilterWidget";
import { getRunStatusOptions } from "metabase/transforms/utils";
import { Group } from "metabase/ui";
import type {
  Transform,
  TransformGraphRunType,
  TransformId,
  TransformRunMethod,
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

  const handleEndTimeChange = (endTime: string | undefined) => {
    onFilterOptionsChange({ ...filterOptions, endTime });
  };

  const handleRunMethodsChange = (runMethods: TransformRunMethod[]) => {
    onFilterOptionsChange({ ...filterOptions, runMethods });
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
      <TimeFilterWidget
        label={t`Ended at`}
        value={filterOptions.endTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleEndTimeChange}
      />
      <StatusFilterWidget
        label={t`Status`}
        statuses={filterOptions.statuses ?? []}
        options={getRunStatusOptions()}
        onChange={handleStatusesChange}
      />
      <RunMethodFilterWidget
        runMethods={filterOptions.runMethods ?? []}
        onChange={handleRunMethodsChange}
      />
    </Group>
  );
}
