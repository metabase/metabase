import { push } from "react-router-redux";
import { t } from "ttag";

import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import Link from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch , useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Box, Card, Flex, NavLink, Text } from "metabase/ui";
import {
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import { TimezoneIndicator } from "metabase-enterprise/transforms/components/TimezoneIndicator";
import type { Transform } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { TagList } from "../../../components/TagList";
import type { TransformListParams } from "../../../types";
import { getTransformUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";
import { CreateTransformMenu } from "../CreateTransformMenu";
import { hasFilterParams } from "../utils";

import S from "./TransformList.module.css";

type TransformListProps = {
  params: TransformListParams;
};

export function TransformList({ params }: TransformListProps) {
  const systemTimezone = useSetting("system-timezone");
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
  const dispatch = useDispatch();

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
      onChangeSorting={() => null}
      AddButton={CreateTransformMenu}
      listItems={
        <Box>
          {transforms.map((transform) => (
            <TransformListItem key={transform.id} transform={transform} />
          ))}
        </Box>
      }
    />
  );
}

function TransformListItem({ transform }: { transform: Transform }) {
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
          <Box c="text-light" fz="sm">
            {t`Target:`} {transform.target.name}
          </Box>
        </Box>
      }
    />
  )
}
