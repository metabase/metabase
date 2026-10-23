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
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import type { TransformRunFilterOptions } from "../types";

import { TagFilterWidget } from "./TagFilterWidget";

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

type RunFilterBarProps = {
  filterOptions: TransformRunFilterOptions;
  transforms: Transform[];
  tags: TransformTag[];
  onFilterOptionsChange: (filterOptions: TransformRunFilterOptions) => void;
};

export function RunFilterBar({
  filterOptions,
  transforms,
  tags,
  onFilterOptionsChange,
}: RunFilterBarProps) {
  const handleTransformsChange = (transformIds: TransformId[]) => {
    onFilterOptionsChange({ ...filterOptions, transformIds });
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    onFilterOptionsChange({ ...filterOptions, statuses });
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    onFilterOptionsChange({ ...filterOptions, transformTagIds: tagIds });
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
      <TagFilterWidget
        label={t`Tags`}
        tagIds={filterOptions.transformTagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
