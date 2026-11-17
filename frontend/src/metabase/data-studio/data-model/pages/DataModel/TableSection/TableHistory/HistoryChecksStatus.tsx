import {
  getFailedChecks,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import type { Table } from "metabase-types/api";

import { DataQualityChecks } from "../DataQualityChecks";

export function HistoryChecksStatus({ table }: { table: Table }) {
  const status = useHistoryReviewStatus(table);
  if (status == null || status.profileState.status === "unbound") {
    return null;
  }
  const { profileState } = status;
  return (
    <DataQualityChecks
      failingCount={
        profileState.status === "loaded"
          ? getFailedChecks(profileState.profile).length
          : null
      }
    />
  );
}
