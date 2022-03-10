import React from "react";
import { t } from "ttag";
import {
  EmptyStateIcon,
  EmptyStateRoot,
  EmptyStateText,
} from "./TimelineEmptyState.styled";

const TimelineEmptyState = (): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>
        {t`Add events to Metabase to show helpful context alongside your data.`}
      </EmptyStateText>
    </EmptyStateRoot>
  );
};

export default TimelineEmptyState;
