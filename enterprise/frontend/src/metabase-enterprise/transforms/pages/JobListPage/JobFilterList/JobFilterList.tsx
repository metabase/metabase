import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { DatePickerRelativeIntervalDirection } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import { getJobListUrl } from "metabase-enterprise/transforms/urls";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { JobListParams } from "../../../types";

type FilterListProps = {
  params: JobListParams;
  tags: TransformTag[];
};

const PAST_INTERVAL_DIRECTIONS: DatePickerRelativeIntervalDirection[] = [
  "last",
  "current",
];

const FUTURE_INTERVAL_DIRECTIONS: DatePickerRelativeIntervalDirection[] = [
  "current",
  "next",
];

export function JobFilterList({ params, tags }: FilterListProps) {
  const dispatch = useDispatch();

  const handleLastRunStartTimeChange = (lastRunStartTime?: string) => {
    dispatch(replace(getJobListUrl({ ...params, lastRunStartTime })));
  };

  const handleNextRunStartTimeChange = (nextRunStartTime?: string) => {
    dispatch(replace(getJobListUrl({ ...params, nextRunStartTime })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(replace(getJobListUrl({ ...params, transformTagIds: tagIds })));
  };

  return (
    <Group>
      <TimeFilterWidget
        label={t`Last run at`}
        value={params.lastRunStartTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleLastRunStartTimeChange}
      />
      <TimeFilterWidget
        label={t`Next run at`}
        value={params.nextRunStartTime}
        availableDirections={FUTURE_INTERVAL_DIRECTIONS}
        onChange={handleNextRunStartTimeChange}
      />
      <TagFilterWidget
        tagIds={params.transformTagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
