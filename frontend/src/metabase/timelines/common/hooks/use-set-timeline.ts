import { useCallback } from "react";
import { t } from "ttag";

import { useUpdateTimelineEventMutation } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { Timeline, TimelineEvent } from "metabase-types/api";

export function useSetTimeline() {
  const dispatch = useDispatch();
  const [updateTimelineEvent] = useUpdateTimelineEventMutation();

  return useCallback(
    async (
      event: Pick<TimelineEvent, "id" | "timeline_id">,
      timeline: Pick<Timeline, "id">,
    ) => {
      const previousTimelineId = event.timeline_id;
      await updateTimelineEvent({
        id: event.id,
        timeline_id: timeline.id,
      }).unwrap();

      dispatch(
        addUndo({
          subject: t`event`,
          verb: t`moved`,
          actions: [
            () =>
              updateTimelineEvent({
                id: event.id,
                timeline_id: previousTimelineId,
              }),
          ],
        }),
      );
    },
    [dispatch, updateTimelineEvent],
  );
}
