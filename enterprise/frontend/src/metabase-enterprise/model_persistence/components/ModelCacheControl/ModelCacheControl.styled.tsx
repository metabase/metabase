import styled from "@emotion/styled";
import LoadingSpinner from "metabase/components/LoadingSpinner";

export const SpinnerContainer = styled.div`
  display: flex;
  justify-content: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(0, 0, 0, 0);

  ${LoadingSpinner.SpinnerRoot} {
    height: 18px;
  }
`;
