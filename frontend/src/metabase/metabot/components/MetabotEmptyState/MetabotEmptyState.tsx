import React from "react";
import { EmptyStateIcon, EmptyStateRoot } from "./MetabotEmptyState.styled";

const MetabotEmptyState = () => {
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="insight" />
    </EmptyStateRoot>
  );
};

export default MetabotEmptyState;
