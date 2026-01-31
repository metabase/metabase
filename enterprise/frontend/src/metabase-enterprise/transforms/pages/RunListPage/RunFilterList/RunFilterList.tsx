import { t } from "ttag";

import type * as Urls from "metabase/lib/urls";
import type { RelativeIntervalDirection } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import type {
  Transform,
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { RunMethodFilterWidget } from "./RunMethodFilterWidget";
import { StatusFilterWidget } from "./StatusFilterWidget";
import { TagFilterWidget } from "./TagFilterWidget";
import { TimeFilterWidget } from "./TimeFilterWidget";
import { TransformFilterWidget } from "./TransformFilterWidget";

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

type RunFilterListProps = {
  params: Urls.TransformRunListParams;
  transforms: Transform[];
  tags: TransformTag[];
  onParamsChange: (params: Urls.TransformRunListParams) => void;
};

export function RunFilterList({
  params,
  transforms,
  tags,
  onParamsChange,
}: RunFilterListProps) {
  const handleTransformsChange = (transformIds: TransformId[]) => {
    onParamsChange({ ...params, transform_ids: transformIds });
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    onParamsChange({ ...params, statuses });
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    onParamsChange({ ...params, transform_tag_ids: tagIds });
  };

  const handleStartTimeChange = (startTime: string | undefined) => {
    onParamsChange({ ...params, start_time: startTime });
  };

  const handleEndTimeChange = (endTime: string | undefined) => {
    onParamsChange({ ...params, end_time: endTime });
  };

  const handleRunMethodsChange = (runMethods: TransformRunMethod[]) => {
    onParamsChange({ ...params, run_methods: runMethods });
  };

  return (
    <Group>
      <TransformFilterWidget
        transformIds={params.transform_ids ?? []}
        transforms={transforms}
        onChange={handleTransformsChange}
      />
      <TimeFilterWidget
        label={t`Started at`}
        value={params.start_time}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleStartTimeChange}
      />
      <TimeFilterWidget
        label={t`Ended at`}
        value={params.end_time}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleEndTimeChange}
      />
      <StatusFilterWidget
        label={t`Status`}
        statuses={params.statuses ?? []}
        onChange={handleStatusesChange}
      />
      <RunMethodFilterWidget
        runMethods={params.run_methods ?? []}
        onChange={handleRunMethodsChange}
      />
      <TagFilterWidget
        label={t`Tags`}
        tagIds={params.transform_tag_ids ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
