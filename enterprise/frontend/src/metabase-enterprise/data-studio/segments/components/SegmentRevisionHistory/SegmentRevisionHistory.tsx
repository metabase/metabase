import { t } from "ttag";

import type { Revision, Segment } from "metabase-types/api";

import { RevisionHistoryTimeline } from "../../../components/RevisionHistory";

type SegmentRevisionHistoryProps = {
  segment: Segment;
};

export function SegmentRevisionHistory({
  segment,
}: SegmentRevisionHistoryProps) {
  return (
    <RevisionHistoryTimeline
      entityType="segment"
      entityId={segment.id}
      tableId={segment.table_id}
      getActionDescription={getSegmentActionDescription}
      definitionLabel={t`Filter`}
      definitionType="filters"
    />
  );
}

function getSegmentActionDescription(revision: Revision): string {
  if (revision.is_creation) {
    return t`created this segment`;
  }
  if (revision.is_reversion) {
    return t`reverted to a previous version`;
  }

  const changedKeys = Object.keys(revision.diff || {});
  if (changedKeys.length === 1) {
    switch (changedKeys[0]) {
      case "name":
        return t`renamed the segment`;
      case "description":
        return t`updated the description`;
      case "definition":
        return t`changed the filter definition`;
    }
  }

  if (changedKeys.length > 1) {
    return t`made multiple changes`;
  }

  return t`made changes`;
}
