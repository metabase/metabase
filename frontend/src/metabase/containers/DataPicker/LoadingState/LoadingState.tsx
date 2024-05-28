import LoadingSpinner from "metabase/components/LoadingSpinner";

import { LoadingStateContainer } from "./LoadingState.styled";

function LoadingState() {
  return (
    <LoadingStateContainer>
      <LoadingSpinner />
    </LoadingStateContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingState;
