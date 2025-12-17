import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  skipToken,
  useListRevisionsQuery,
  useRevertRevisionMutation,
} from "metabase/api";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import type { Document } from "metabase-types/api";

interface DocumentRevisionHistorySidebarProps {
  document: Document;
  onClose: () => void;
}

export function DocumentRevisionHistorySidebar({
  document,
  onClose,
}: DocumentRevisionHistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = useSelector(getUser);

  useHotkeys([["]", onClose]]);

  useMount(() => {
    setIsOpen(true);
  });

  const { data: revisions } = useListRevisionsQuery(
    document ? { id: document.id, entity: "document" } : skipToken,
  );
  const [revertToRevision] = useRevertRevisionMutation();

  const canWrite = document.can_write && !document.archived;

  const events = useMemo(() => {
    const revisionEvents = getTimelineEvents({ revisions, currentUser });
    return revisionEvents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [revisions, currentUser]);

  return (
    <ErrorBoundary>
      <Sidesheet isOpen={isOpen} title={t`History`} onClose={onClose}>
        <SidesheetCard>
          <Timeline
            events={events}
            data-testid="document-history-list"
            revert={(revision) =>
              revertToRevision({
                entity: "document",
                id: document.id,
                revision_id: revision.id,
              })
            }
            canWrite={canWrite}
            entity="document"
          />
        </SidesheetCard>
      </Sidesheet>
    </ErrorBoundary>
  );
}
