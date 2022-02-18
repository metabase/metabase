import React from "react";
import { t } from "ttag";
import {
  EmptyStateIcon,
  EmptyStateRoot,
  EmptyStateText,
} from "./EventEmptyState.styled";

const EventEmptyState = (): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>{t`No events found`}</EmptyStateText>
    </EmptyStateRoot>
  );
};

export default EventEmptyState;
