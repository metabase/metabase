import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

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
import type { Transform } from "metabase-types/api";

interface TransformRevisionHistorySidebarProps {
  transform: Transform;
  onClose: () => void;
}

export function TransformRevisionHistorySidebar({
  transform,
  onClose,
}: TransformRevisionHistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = useSelector(getUser);

  useHotkeys([["]", onClose]]);

  useMount(() => {
    setIsOpen(true);
  });

  const { data: revisions } = useListRevisionsQuery(
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

  return (
    <Sidesheet isOpen={isOpen} title={t`History`} onClose={onClose}>
      <SidesheetCard>
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
          canWrite
        />
      </SidesheetCard>
    </Sidesheet>
  );
}
