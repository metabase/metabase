import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import { useListTransformExecutionsQuery } from "metabase-enterprise/api";
import type { TransformExecution } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getTransformUrl } from "../../../urls";
import { formatStatus, formatTimestamp, formatTrigger } from "../../../utils";

import S from "./RunList.module.css";

export function RunList() {
  const { data, isLoading, error } = useListTransformExecutionsQuery({});
  const dispatch = useDispatch();

  const handleRowClick = (execution: TransformExecution) => {
    if (execution.transform) {
      dispatch(push(getTransformUrl(execution.transform.id)));
    }
  };

  if (!data || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { data: executions } = data;
  if (executions.length === 0) {
    return <ListEmptyState label={t`No runs yet`} />;
  }

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Transform`,
          t`Started at`,
          t`End at`,
          t`Status`,
          t`Trigger`,
        ]}
      >
        {executions.map((execution) => (
          <tr
            key={execution.id}
            className={S.row}
            onClick={() => handleRowClick(execution)}
          >
            <td>{execution.transform?.name}</td>
            <td>{formatTimestamp(execution.start_time)}</td>
            <td>
              {execution.end_time ? formatTimestamp(execution.end_time) : null}
            </td>
            <td>{formatStatus(execution.status)}</td>
            <td>{formatTrigger(execution.trigger)}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
