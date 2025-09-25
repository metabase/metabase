import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { RelativeIntervalDirection } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import { getRunListUrl } from "metabase-enterprise/transforms/urls";
import type {
  Transform,
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { StatusFilterWidget } from "../../../components/StatusFilterWidget";
import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { RunListParams } from "../../../types";

import { RunMethodFilterWidget } from "./RunMethodFilterWidget";
import { TransformFilterWidget } from "./TransformFilterWidget";

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "last",
  "current",
];

type RunFilterListProps = {
  params: RunListParams;
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
    dispatch(replace(getRunListUrl({ ...params, transformIds: transformIds })));
  };

  const handleStatusesChange = (statuses: TransformRunStatus[]) => {
    dispatch(replace(getRunListUrl({ ...params, statuses })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(replace(getRunListUrl({ ...params, transformTagIds: tagIds })));
  };

  const handleStartTimeChange = (startTime: string | undefined) => {
    dispatch(replace(getRunListUrl({ ...params, startTime })));
  };

  const handleEndTimeChange = (endTime: string | undefined) => {
    dispatch(replace(getRunListUrl({ ...params, endTime })));
  };

  const handleRunMethodsChange = (runMethods: TransformRunMethod[]) => {
    dispatch(replace(getRunListUrl({ ...params, runMethods })));
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
