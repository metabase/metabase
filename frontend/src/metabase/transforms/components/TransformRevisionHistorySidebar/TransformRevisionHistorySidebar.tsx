import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useListRevisionsQuery,
  useRevertRevisionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
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
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = useSelector(getUser);

  useHotkeys([["]", onClose]]);

  useMount(() => {
    setIsOpen(true);
  });

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
    <Sidesheet isOpen={isOpen} title={t`History`} onClose={onClose}>
      <SidesheetCard>
        {isLoading || error ? (
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        ) : (
          <Timeline
            events={events}
            data-testid="transform-history-list"
            revert={(revision) =>
              revertToRevision({
                entity: "transform",
                id: transform.id,
                revision_id: revision.id,
              })
            }
            entity="transform"
            canWrite={!readOnly}
          />
        )}
      </SidesheetCard>
    </Sidesheet>
  );
}
