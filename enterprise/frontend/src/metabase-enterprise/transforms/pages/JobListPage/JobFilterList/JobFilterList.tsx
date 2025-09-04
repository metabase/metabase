import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { DatePickerShortcut } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import { getJobListUrl } from "metabase-enterprise/transforms/urls";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { JobListParams } from "../../../types";

type FilterListProps = {
  tags: TransformTag[];
  params: JobListParams;
};

const NO_SHORTCUTS: DatePickerShortcut[] = [];

export function JobFilterList({ tags, params }: FilterListProps) {
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
        onChange={handleLastRunStartTimeChange}
      />
      <TimeFilterWidget
        label={t`Next run`}
        value={params.nextRunStartTime}
        onChange={handleNextRunStartTimeChange}
        availableShortcuts={NO_SHORTCUTS}
      />
      <TagFilterWidget
        tagIds={params.transformTagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
