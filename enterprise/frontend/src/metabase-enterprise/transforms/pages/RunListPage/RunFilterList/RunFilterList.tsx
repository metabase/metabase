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
    onParamsChange({ ...params, transformIds, page: undefined });
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    onParamsChange({ ...params, statuses, page: undefined });
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    onParamsChange({ ...params, transformTagIds: tagIds, page: undefined });
  };

  const handleStartTimeChange = (startTime: string | undefined) => {
    onParamsChange({ ...params, startTime, page: undefined });
  };

  const handleEndTimeChange = (endTime: string | undefined) => {
    onParamsChange({ ...params, endTime, page: undefined });
  };

  const handleRunMethodsChange = (runMethods: TransformRunMethod[]) => {
    onParamsChange({ ...params, runMethods, page: undefined });
  };

  return (
    <Group>
      <TransformFilterWidget
        transformIds={params.transformIds ?? []}
        transforms={transforms}
        onChange={handleTransformsChange}
      />
      <TimeFilterWidget
        label={t`Started at`}
        value={params.startTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleStartTimeChange}
      />
      <TimeFilterWidget
        label={t`Ended at`}
        value={params.endTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleEndTimeChange}
      />
      <StatusFilterWidget
        label={t`Status`}
        statuses={params.statuses ?? []}
        onChange={handleStatusesChange}
      />
      <RunMethodFilterWidget
        runMethods={params.runMethods ?? []}
        onChange={handleRunMethodsChange}
      />
      <TagFilterWidget
        label={t`Tags`}
        tagIds={params.transformTagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
