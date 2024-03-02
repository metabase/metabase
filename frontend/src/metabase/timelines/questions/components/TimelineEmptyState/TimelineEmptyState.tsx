import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { Collection, Timeline } from "metabase-types/api";

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

  const applicationName = useSelector(getApplicationName);
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>
        {canWrite
          ? t`Add events to ${applicationName} to show helpful context alongside your data.`
          : t`Events in ${applicationName} let you see helpful context alongside your data.`}
      </EmptyStateText>
      {canWrite && (
        <EmptyStateButton primary onClick={onNewEvent}>
          {t`Add an event`}
        </EmptyStateButton>
      )}
    </EmptyStateRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEmptyState;
