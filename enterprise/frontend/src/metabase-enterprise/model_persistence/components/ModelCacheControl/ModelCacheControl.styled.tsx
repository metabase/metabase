import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";

export const SpinnerContainer = styled.div`
  display: flex;
  justify-content: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid transparent;

  ${LoadingSpinner.Root} {
    height: 18px;
  }
`;
