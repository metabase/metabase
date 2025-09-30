import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { RelativeIntervalDirection } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import { getJobListUrl } from "metabase-enterprise/transforms/urls";
import type {
  TransformRunStatus,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { StatusFilterWidget } from "../../../components/StatusFilterWidget";
import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { JobListParams } from "../../../types";

type JobFilterListProps = {
  params: JobListParams;
  tags: TransformTag[];
};

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

const FUTURE_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "current",
  "future",
];

export function JobFilterList({ params, tags }: JobFilterListProps) {
  const dispatch = useDispatch();

  const handleLastRunStartTimeChange = (lastRunStartTime?: string) => {
    dispatch(replace(getJobListUrl({ ...params, lastRunStartTime })));
  };

  const handleLastRunStatusesChange = (
    lastRunStatuses?: TransformRunStatus[],
  ) => {
    dispatch(replace(getJobListUrl({ ...params, lastRunStatuses })));
  };

  const handleNextRunStartTimeChange = (nextRunStartTime?: string) => {
    dispatch(replace(getJobListUrl({ ...params, nextRunStartTime })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(replace(getJobListUrl({ ...params, tagIds })));
  };

  return (
    <Group>
      <TimeFilterWidget
        label={t`Last run at`}
        value={params.lastRunStartTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleLastRunStartTimeChange}
      />
      <StatusFilterWidget
        label={t`Last run status`}
        statuses={params.lastRunStatuses ?? []}
        onChange={handleLastRunStatusesChange}
      />
      <TimeFilterWidget
        label={t`Next run at`}
        value={params.nextRunStartTime}
        availableDirections={FUTURE_INTERVAL_DIRECTIONS}
        onChange={handleNextRunStartTimeChange}
      />
      <TagFilterWidget
        label={t`Tags`}
        tagIds={params.tagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
