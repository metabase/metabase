import { t } from "ttag";

import { TimelineEventInfo } from "metabase/common/components/TimelineEventInfo";
import { Box } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

import S from "./TimelineEventCard.module.css";

interface TimelineEventCardProps {
  event: TimelineEvent;
}

export function TimelineEventCard({ event }: TimelineEventCardProps) {
  return (
    <Box className={S.card} aria-label={t`Timeline event card`}>
      <TimelineEventInfo event={event} />
    </Box>
  );
}
