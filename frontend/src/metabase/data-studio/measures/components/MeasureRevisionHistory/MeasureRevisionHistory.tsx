import { t } from "ttag";

import type { Measure, Revision } from "metabase-types/api";

import { RevisionHistoryTimeline } from "../../../components/RevisionHistory";

type MeasureRevisionHistoryProps = {
  measure: Measure;
};

export function MeasureRevisionHistory({
  measure,
}: MeasureRevisionHistoryProps) {
  return (
    <RevisionHistoryTimeline
      entityType="measure"
      entityId={measure.id}
      tableId={measure.table_id}
      getActionDescription={getMeasureActionDescription}
      definitionLabel={t`Aggregation`}
      definitionType="aggregations"
    />
  );
}

function getMeasureActionDescription(revision: Revision): string {
  if (revision.is_creation) {
    return t`created this measure`;
  }
  if (revision.is_reversion) {
    return t`reverted to a previous version`;
  }

  const changedKeys = Object.keys(revision.diff || {});
  if (changedKeys.length === 1) {
    switch (changedKeys[0]) {
      case "name":
        return t`renamed the measure`;
      case "description":
        return t`updated the description`;
      case "definition":
        return t`changed the aggregation definition`;
    }
  }

  if (changedKeys.length > 1) {
    return t`made multiple changes`;
  }

  return t`made changes`;
}
