import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import {
  StateBody,
  StateRoot,
  StateMessage,
  StateThread,
  StateThreadStroke,
  StateThreadIconContainer,
  StateThreadIcon,
} from "./TimelineEmptyState.styled";

export interface TimelineEmptyStateProps {
  timeline?: Timeline;
  collection: Collection;
}

const TimelineEmptyState = ({
  timeline,
  collection,
}: TimelineEmptyStateProps): JSX.Element => {
  const link = timeline
    ? Urls.newEventInCollection(timeline, collection)
    : Urls.newEventAndTimelineInCollection(collection);

  return (
    <StateRoot>
      <StateBody>
        <StateThread>
          <StateThreadStroke />
          <StateThreadIconContainer>
            <StateThreadIcon name="balloons" />
          </StateThreadIconContainer>
          <StateThreadStroke />
        </StateThread>
        <StateMessage>
          {t`Add events to Metabase to open important milestones, launches, or anything else, right alongside your data.`}
        </StateMessage>
        <Link className="Button Button--primary" to={link}>
          {t`Add an event`}
        </Link>
      </StateBody>
    </StateRoot>
  );
};

export default TimelineEmptyState;
