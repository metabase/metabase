import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Card } from "metabase/ui";
import { useListTransformExecutionsQuery } from "metabase-enterprise/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { formatStatus, formatTimestamp, formatTrigger } from "../../../utils";

export function RunList() {
  const { data, isLoading, error } = useListTransformExecutionsQuery({});

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
          <tr key={execution.id}>
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
