import React from "react";
import { t } from "ttag";
import {
  EmptyStateIcon,
  EmptyStateRoot,
  EmptyStateText,
} from "./EventEmptyState.styled";

export interface EventEmptyStateProps {
  isTimeline?: boolean;
}

const EventEmptyState = ({ isTimeline }: EventEmptyStateProps): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>
        {isTimeline ? t`No timelines found` : t`No events found`}
      </EmptyStateText>
    </EmptyStateRoot>
  );
};

export default EventEmptyState;
