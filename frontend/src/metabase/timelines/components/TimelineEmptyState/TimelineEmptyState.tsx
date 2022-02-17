import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import {
  EmptyStateBody,
  EmptyStateRoot,
  EmptyStateText,
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
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateText>
          {t`Add events to Metabase to open important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateText>
        <Link className="Button Button--primary" to={link}>
          {t`Add an event`}
        </Link>
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

export default TimelineEmptyState;
