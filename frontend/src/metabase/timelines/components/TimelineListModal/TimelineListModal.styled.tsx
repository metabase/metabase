import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ModalBody = styled.div`
  padding: 2rem;
`;

export const ListRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 22.5rem;
`;

export const EmptyStateText = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 2rem;
`;
