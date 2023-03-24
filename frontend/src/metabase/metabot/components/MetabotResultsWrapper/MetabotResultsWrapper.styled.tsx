import styled from "@emotion/styled";
import EmptyState from "metabase/components/EmptyState";

export const ErrorWrapperRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const ErrorState = styled(EmptyState)`
  max-width: 400px;
  padding: 1rem;
`;
