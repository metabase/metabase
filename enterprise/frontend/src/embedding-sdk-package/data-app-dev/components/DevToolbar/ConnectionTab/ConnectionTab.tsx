/* eslint-disable i18next/no-literal-string */
/* eslint-disable metabase/no-literal-metabase-strings -- dev-only toolbar for data-app authors */
import type { InstanceConnectionStatus } from "../../../types/diagnostics-channel";
import S from "../DevToolbar.module.css";
import { StatusRow } from "../StatusRow/StatusRow";

type Props = {
  connection: InstanceConnectionStatus | null;
};

export const ConnectionTab = ({ connection }: Props) => {
  if (!connection) {
    return <div className={S.Empty}>Connection check has not run yet.</div>;
  }

  return (
    <div className={S.StatusBody}>
      <StatusRow label="Metabase URL">{connection.metabaseUrl}</StatusRow>
      <StatusRow label="Reachable">
        {connection.reachable ? "✓" : "✗"}
      </StatusRow>
      <StatusRow label="SDK version">
        {connection.sdkVersion ?? "unknown"}
      </StatusRow>
      {connection.error && <div className={S.Problem}>{connection.error}</div>}
    </div>
  );
};
