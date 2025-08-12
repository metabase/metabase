import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { Group } from "metabase/ui";
import { getRunListUrl } from "metabase-enterprise/transforms/urls";
import type {
  Transform,
  TransformExecutionStatus,
  TransformId,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import type { RunListParams } from "../../../types";

import { StatusFilterWidget } from "./StatusFilterWidget";
import { TagFilterWidget } from "./TagFilterWidget";
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

  const handleStatusesChange = (statuses: TransformExecutionStatus[]) => {
    dispatch(replace(getRunListUrl({ ...params, statuses })));
  };

  const handleTagsChange = (tagIds: TransformTagId[]) => {
    dispatch(replace(getRunListUrl({ ...params, transformTagIds: tagIds })));
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
    </Group>
  );
}
