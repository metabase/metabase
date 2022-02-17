import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import {
  StateBody,
  StateChart,
  StateMessage,
  StateRoot,
  StateThread,
  StateThreadIcon,
  StateThreadIconContainer,
  StateThreadLine,
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
        <StateChart>
          <svg width="231" height="128" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M230.142 1.766 118.697 95.283a5 5 0 0 1-8.877 4.461L.75 127.97l-.501-1.937 108.827-28.16a5 5 0 0 1 8.557-4.306L228.857.233l1.285 1.532ZM114 99.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
        </StateChart>
        <StateThread>
          <StateThreadLine />
          <StateThreadIconContainer>
            <StateThreadIcon name="balloons" />
          </StateThreadIconContainer>
          <StateThreadLine />
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
