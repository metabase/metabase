import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { RelativeIntervalDirection } from "metabase/querying/filters/types";
import { Group } from "metabase/ui";
import { getTransformListUrl } from "metabase-enterprise/transforms/urls";
import type {
  TransformRunStatus,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { StatusFilterWidget } from "../../../components/StatusFilterWidget";
import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { TransformListParams } from "../../../types";

type TransformFilterListProps = {
  params: TransformListParams;
  tags: TransformTag[];
};

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

export function TransformFilterList({
  params,
  tags,
}: TransformFilterListProps) {
  const dispatch = useDispatch();

  const handleLastRunStartTimeChange = (lastRunStartTime?: string) => {
    dispatch(replace(getTransformListUrl({ ...params, lastRunStartTime })));
  };

  const handleLastRunStatusesChange = (
    lastRunStatuses?: TransformRunStatus[],
  ) => {
    dispatch(replace(getTransformListUrl({ ...params, lastRunStatuses })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(replace(getTransformListUrl({ ...params, tagIds })));
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
      <TagFilterWidget
        label={t`Tags`}
        tagIds={params.tagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
    </Group>
  );
}
