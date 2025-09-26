import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Card, Flex } from "metabase/ui";
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

  const handleRowClick = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

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
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          t`Target`,
          <Flex key="last-run-at" component="span" align="center" gap="xs">
            <span className={S.nowrap}>{t`Last run at`}</span>{" "}
            <TimezoneIndicator />
          </Flex>,
          <span key="last-run-status" className={S.nowrap}>
            {t`Last run status`}
          </span>,
          t`Tags`,
        ]}
      >
        {transforms.map((transform) => (
          <tr
            key={transform.id}
            className={S.row}
            onClick={() => handleRowClick(transform)}
          >
            <td className={S.wrap}>{transform.name}</td>
            <td className={S.wrap}>{transform.target.name}</td>
            <td className={S.nowrap}>
              {transform.last_run?.end_time
                ? parseTimestampWithTimezone(
                    transform.last_run.end_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              {transform.last_run != null ? (
                <RunStatusInfo
                  status={transform.last_run.status}
                  message={transform.last_run.message}
                  endTime={
                    transform.last_run.end_time != null
                      ? parseTimestampWithTimezone(
                          transform.last_run.end_time,
                          systemTimezone,
                        ).toDate()
                      : null
                  }
                />
              ) : null}
            </td>
            <td className={S.wrap}>
              <TagList tags={tags} tagIds={transform.tag_ids ?? []} />
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
