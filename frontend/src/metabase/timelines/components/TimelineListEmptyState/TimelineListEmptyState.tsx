import React from "react";
import { t } from "ttag";
import moment from "moment";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
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
  StateTooltip,
  StateTooltipBody,
  StateTooltipDate,
  StateTooltipIcon,
  StateTooltipTitle,
} from "./TimelineListEmptyState.styled";

export interface TimelineListEmptyStateProps {
  timeline?: Timeline;
  collection: Collection;
}

const TimelineListEmptyState = ({
  timeline,
  collection,
}: TimelineListEmptyStateProps): JSX.Element => {
  const link = timeline
    ? Urls.newEventInCollection(timeline, collection)
    : Urls.newEventAndTimelineInCollection(collection);
  const date = formatDateTimeWithUnit(
    moment(),
    "day",
    Settings.formattingOptions(),
  );

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
        <StateTooltip>
          <StateTooltipIcon name="mail" />
          <StateTooltipBody>
            <StateTooltipTitle>{t`Launch of v2.0`}</StateTooltipTitle>
            <StateTooltipDate>{date}</StateTooltipDate>
          </StateTooltipBody>
        </StateTooltip>
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

export default TimelineListEmptyState;
