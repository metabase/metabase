import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import {
  useListTransformTagsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { TagList } from "../../../components/TagList";
import { getTransformUrl } from "../../../urls";
import { parseLocalTimestamp } from "../../../utils";

import S from "./TransformList.module.css";

export function TransformList() {
  const {
    data: transforms = [],
    isLoading: isLoadingTransforms,
    error: transformsError,
  } = useListTransformsQuery();
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
    return <ListEmptyState label={t`No transforms yet`} />;
  }

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          t`Target`,
          t`Last run at`,
          t`Last run status`,
          t`Tags`,
        ]}
      >
        {transforms.map((transform) => (
          <tr
            key={transform.id}
            className={S.row}
            onClick={() => handleRowClick(transform)}
          >
            <td>{transform.name}</td>
            <td>{transform.target.name}</td>
            <td className={S.nowrap}>
              {transform.last_run?.end_time
                ? parseLocalTimestamp(transform.last_run.end_time).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              {transform.last_run != null ? (
                <RunStatusInfo
                  status={transform.last_run.status}
                  message={transform.last_run.message}
                  endTime={
                    transform.last_run.end_time != null
                      ? parseLocalTimestamp(
                          transform.last_run.end_time,
                        ).toDate()
                      : null
                  }
                />
              ) : null}
            </td>
            <td>
              <TagList tags={tags} tagIds={transform.tag_ids ?? []} />
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
