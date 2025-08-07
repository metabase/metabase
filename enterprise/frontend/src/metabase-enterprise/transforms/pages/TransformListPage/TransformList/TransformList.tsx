import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { formatStatus, formatTimestamp } from "../../..//utils";
import { ListEmptyState } from "../../../components/ListEmptyState";
import { getTransformUrl } from "../../../urls";

import S from "./TransformList.module.css";

export function TransformList() {
  const { data: transforms = [], isLoading, error } = useListTransformsQuery();
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
          `Last run status`,
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
            <td>
              {transform.last_execution?.status
                ? formatStatus(transform.last_execution.status)
                : null}
            </td>
            <td>
              {transform.last_execution?.end_time
                ? formatTimestamp(transform.last_execution?.end_time)
                : null}
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
