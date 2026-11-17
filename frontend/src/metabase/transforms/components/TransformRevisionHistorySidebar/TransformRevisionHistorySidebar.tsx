import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListRevisionsQuery,
  useRevertRevisionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import type { Transform } from "metabase-types/api";

interface TransformRevisionHistorySidebarProps {
  transform: Transform;
  onClose: () => void;
  readOnly?: boolean;
}

export function TransformRevisionHistorySidebar({
  transform,
  onClose,
  readOnly,
}: TransformRevisionHistorySidebarProps) {
  const currentUser = useSelector(getUser);

  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery(
    transform ? { id: transform.id, entity: "transform" } : skipToken,
  );
  const [revertToRevision] = useRevertRevisionMutation();

  const events = useMemo(() => {
    const revisionEvents = getTimelineEvents({ revisions, currentUser });
    return revisionEvents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [revisions, currentUser]);

  if (isLoading || error) {
    return;
  }

  return (
    <Sidesheet isOpen title={t`History`} onClose={onClose} closeHotkey="]">
      <SidesheetCard>
        {isLoading || error ? (
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        ) : (
          <RevisionHistoryTimeline
            events={events}
            data-testid="transform-history-list"
            revert={(revision) =>
              revertToRevision({
                entity: "transform",
                id: transform.id,
                revision_id: revision.id,
              }).unwrap()
            }
            entity="transform"
            canWrite={!readOnly}
          />
        )}
      </SidesheetCard>
    </Sidesheet>
  );
}
