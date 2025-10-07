import { t } from "ttag";

import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import Link from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Box,  NavLink, Text } from "metabase/ui";
import {
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { Transform, TransformTag } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { TagList } from "../../../components/TagList";
import type { TransformListParams } from "../../../types";
import { getTransformUrl } from "../../../urls";
import { CreateTransformMenu } from "../CreateTransformMenu";
import { hasFilterParams } from "../utils";

type TransformListProps = {
  params: TransformListParams;
  onCollapse: () => void;
};

export function TransformList({ params, onCollapse }: TransformListProps) {
  const {
    data: transforms = [],
    isLoading: isLoadingTransforms,
    error: transformsError,
  } = useListTransformsQuery({
    last_run_start_time: params.lastRunStartTime,
    last_run_statuses: params.lastRunStatuses,
    tag_ids: params.tagIds,
  });
  const {
    data: tags = [],
    isLoading: isLoadingTags,
    error: tagsError,
  } = useListTransformTagsQuery();
  const isLoading = isLoadingTransforms || isLoadingTags;
  const error = transformsError ?? tagsError;

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transforms.length === 0) {
    const hasFilters = hasFilterParams(params);
    return (
      <ListEmptyState
        label={hasFilters ? t`No transforms found` : t`No transforms yet`}
      />
    );
  }

  return (
    <ItemsListSection
      sectionTitle={t`Transforms`}
      titleMenuItems={<div />}
      onCollapse={onCollapse}
      onChangeSorting={() => null}
      AddButton={CreateTransformMenu}
      listItems={
        <Box>
          {transforms.map((transform) => (
            <TransformListItem key={transform.id} transform={transform} tags={tags} />
          ))}
        </Box>
      }
    />
  );
}

function TransformListItem({ transform, tags }: { transform: Transform, tags: TransformTag[] }) {
  const location = useSelector(getLocation);
  // get id off the end
  const id = location?.pathname?.split("/")?.pop();
  const isActive = id === String(transform.id);
  return (
    <NavLink
      component={Link}
      to={getTransformUrl(transform.id)}
      active={isActive}
      w="100%"
      label={
        <Box>
          <Text fw="bold">{transform.name}</Text>
          <Box c="text-light" fz="sm" mb="xs" ff="monospace">
            {transform.target.name}
          </Box>
          <TagList tags={tags} tagIds={transform.tag_ids ?? []} />
        </Box>
      }
    />
  )
}
