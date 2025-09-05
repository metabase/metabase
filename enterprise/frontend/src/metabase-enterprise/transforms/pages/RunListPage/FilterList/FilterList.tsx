import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
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

import { TagFilterWidget } from "../../../components/TagFilterWidget";
import { TimeFilterWidget } from "../../../components/TimeFilterWidget";
import type { RunListParams } from "../../../types";

import { RunMethodFilterWidget } from "./RunMethodFilterWidget";
import { StatusFilterWidget } from "./StatusFilterWidget";
import { TransformFilterWidget } from "./TransformFilterWidget";

type FilterListProps = {
  transforms: Transform[];
  tags: TransformTag[];
  params: RunListParams;
};

export function FilterList({ transforms, tags, params }: FilterListProps) {
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
      <StatusFilterWidget
        statuses={params.statuses ?? []}
        onChange={handleStatusesChange}
      />
      <TagFilterWidget
        tagIds={params.transformTagIds ?? []}
        tags={tags}
        onChange={handleTagsChange}
      />
      <TimeFilterWidget
        label={t`Start at`}
        value={params.startTime}
        onChange={handleStartTimeChange}
      />
      <TimeFilterWidget
        label={t`End at`}
        value={params.endTime}
        onChange={handleEndTimeChange}
      />
      <RunMethodFilterWidget
        runMethods={params.runMethods ?? []}
        onChange={handleRunMethodsChange}
      />
    </Group>
  );
}
