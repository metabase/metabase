import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const EmptyStateContainer = styled.div`
  display: flex;
  height: 100%;
  gap: 0.5rem;

  flex-direction: column;
  justify-content: center;
  text-align: center;
  margin: auto;

  max-width: 400px;
`;

const EmptyStateTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  color: ${color("text-dark")};
`;

const EmptyStateMessage = styled.p`
  color: ${color("text-medium")};
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.18rem;

  margin-top: 0.5rem;
`;

const ActionContainer = styled.div`
  margin-top: 1rem;
`;

export default {
  Container: EmptyStateContainer,
  Title: EmptyStateTitle,
  Message: EmptyStateMessage,
  ActionContainer: ActionContainer,
};
