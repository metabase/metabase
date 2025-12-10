import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
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
};

export function RunFilterList({
  params,
  transforms,
  tags,
}: RunFilterListProps) {
  const dispatch = useDispatch();

  const handleTransformsChange = (transformIds: TransformId[]) => {
    dispatch(
      replace(Urls.transformRunList({ ...params, transformIds: transformIds })),
    );
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    dispatch(replace(Urls.transformRunList({ ...params, statuses })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(
      replace(Urls.transformRunList({ ...params, transformTagIds: tagIds })),
    );
  };

  const handleStartTimeChange = (startTime: string | undefined) => {
    dispatch(replace(Urls.transformRunList({ ...params, startTime })));
  };

  const handleEndTimeChange = (endTime: string | undefined) => {
    dispatch(replace(Urls.transformRunList({ ...params, endTime })));
  };

  const handleRunMethodsChange = (runMethods: TransformRunMethod[]) => {
    dispatch(replace(Urls.transformRunList({ ...params, runMethods })));
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
