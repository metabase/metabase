import React from "react";
import { t } from "ttag";
import moment from "moment-timezone";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import {
  EmptyStateBody,
  EmptyStateChart,
  EmptyStateMessage,
  EmptyStateRoot,
  EmptyStateThread,
  EmptyStateThreadIcon,
  EmptyStateThreadIconContainer,
  EmptyStateThreadLine,
  EmptyStateTooltip,
  EmptyStateTooltipBody,
  EmptyStateTooltipDate,
  EmptyStateTooltipIcon,
  EmptyStateTooltipTitle,
} from "./TimelineEmptyState.styled";

export interface TimelineEmptyStateProps {
  timeline?: Timeline;
  collection?: Collection;
}

const TimelineEmptyState = ({
  timeline,
  collection,
}: TimelineEmptyStateProps): JSX.Element => {
  const date = moment();
  const link = timeline
    ? Urls.newEventInCollection(timeline)
    : Urls.newEventAndTimelineInCollection(collection);
  const canWrite = timeline
    ? timeline.collection?.can_write
    : collection?.can_write;

  return (
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateChart>
          <svg width="231" height="128" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M230.142 1.766 118.697 95.283a5 5 0 0 1-8.877 4.461L.75 127.97l-.501-1.937 108.827-28.16a5 5 0 0 1 8.557-4.306L228.857.233l1.285 1.532ZM114 99.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
        </EmptyStateChart>
        <EmptyStateTooltip>
          <EmptyStateTooltipIcon name="mail" />
          <EmptyStateTooltipBody>
            <EmptyStateTooltipTitle>{t`Launch of v2.0`}</EmptyStateTooltipTitle>
            <EmptyStateTooltipDate value={date} unit="day" data-server-date />
          </EmptyStateTooltipBody>
        </EmptyStateTooltip>
        <EmptyStateThread>
          <EmptyStateThreadLine />
          <EmptyStateThreadIconContainer>
            <EmptyStateThreadIcon name="balloons" />
          </EmptyStateThreadIconContainer>
          <EmptyStateThreadLine />
        </EmptyStateThread>
        <EmptyStateMessage>
          {canWrite
            ? t`Add events to Metabase to show important milestones, launches, or anything else, right alongside your data.`
            : t`Events in Metabase let you see important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateMessage>
        {canWrite && (
          <Link className="Button Button--primary" to={link}>
            {t`Add an event`}
          </Link>
        )}
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEmptyState;
