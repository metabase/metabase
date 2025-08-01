import cx from "classnames";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import DateTime from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Stack } from "metabase/ui";

// Mock data for now - this would come from an API call
const mockTransformRuns = [
  {
    id: 1,
    transformName: "Daily Sales Summary",
    startTime: "2024-01-15T10:30:00Z",
    endTime: "2024-01-15T10:32:15Z",
    status: "Successful",
    trigger: "Scheduled",
  },
  {
    id: 2,
    transformName: "Customer Data Cleanup",
    startTime: "2024-01-15T11:00:00Z",
    endTime: null,
    status: "In progress",
    trigger: "Manual",
  },
  {
    id: 3,
    transformName: "Inventory Update",
    startTime: "2024-01-15T09:15:00Z",
    endTime: "2024-01-15T09:15:45Z",
    status: "Failed",
    trigger: "Scheduled",
  },
];

const TransformRunsTable = ({ runs }: { runs: typeof mockTransformRuns }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Failed":
        return CS.textError;
      default:
        return "";
    }
  };

  return (
    <table className={cx(AdminS.ContentTable)}>
      <thead>
        <tr>
          <th>{t`Transform`}</th>
          <th>{t`Start time`}</th>
          <th>{t`End time`}</th>
          <th>{t`Status`}</th>
          <th>{t`Trigger`}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>{run.transformName}</td>
            <td>
              <DateTime value={run.startTime} />
            </td>
            <td>
              {run.endTime ? (
                <DateTime value={run.endTime} />
              ) : (
                <span className={CS.textMedium}>{t`-`}</span>
              )}
            </td>
            <td>
              <span className={getStatusColor(run.status)}>{run.status}</span>
            </td>
            <td>{run.trigger}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export function RunsPage() {
  // In a real implementation, this would be an API call
  const isFetching = false;
  const error = null;
  const data = mockTransformRuns;

  return (
    <SettingsPageWrapper title={t`Transform Runs`}>
      <LoadingAndErrorWrapper loading={isFetching} error={error}>
        <Stack gap="xl">
          <SettingsSection>
            <TransformRunsTable runs={data} />
          </SettingsSection>
        </Stack>
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
}
