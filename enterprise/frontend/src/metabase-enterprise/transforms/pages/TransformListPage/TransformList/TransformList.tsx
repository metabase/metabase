import dayjs from "dayjs";
import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import type { Transform, TransformExecution } from "metabase-types/api";

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
        columnTitles={[t`Name`, t`Target`, t`Last run at`, `Last run status`]}
      >
        {transforms.map((transform) => (
          <tr
            key={transform.id}
            className={S.row}
            onClick={() => handleRowClick(transform)}
          >
            <td>{transform.name}</td>
            <td>{transform.target.name}</td>
            <td>{getLastRunTime(transform.last_execution)}</td>
            <td>{getLastRunStatus(transform.last_execution)}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

function getLastRunTime(execution: TransformExecution | undefined | null) {
  if (execution?.end_time == null) {
    return null;
  }

  return dayjs(execution.end_time).format("lll");
}

function getLastRunStatus(execution: TransformExecution | undefined | null) {
  if (execution == null) {
    return null;
  }

  switch (execution.status) {
    case "started":
      return t`In-progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
  }
}
