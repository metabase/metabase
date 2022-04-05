import React from "react";
import { t } from "ttag";
import { Collection, Timeline } from "metabase-types/api";
import {
  EmptyStateButton,
  EmptyStateIcon,
  EmptyStateRoot,
  EmptyStateText,
} from "./TimelineEmptyState.styled";

export interface TimelineEmptyStateProps {
  timelines: Timeline[];
  collection: Collection;
  onNewEvent?: () => void;
}

const TimelineEmptyState = ({
  timelines,
  collection,
  onNewEvent,
}: TimelineEmptyStateProps): JSX.Element => {
  const canWrite =
    timelines.some(timeline => timeline.collection?.can_write) ||
    collection.can_write;

  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>
        {canWrite
          ? t`Add events to Metabase to show helpful context alongside your data.`
          : t`Events in Metabase let you see helpful context alongside your data.`}
      </EmptyStateText>
      {canWrite && (
        <EmptyStateButton primary onClick={onNewEvent}>
          {t`Add an event`}
        </EmptyStateButton>
      )}
    </EmptyStateRoot>
  );
};

export default TimelineEmptyState;
