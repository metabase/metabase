import React from "react";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { LoadingStateContainer } from "./LoadingState.styled";

function LoadingState() {
  return (
    <LoadingStateContainer>
      <LoadingSpinner />
    </LoadingStateContainer>
  );
}

export default LoadingState;
