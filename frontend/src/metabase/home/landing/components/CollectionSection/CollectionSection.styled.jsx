import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SectionContent = styled.div`
  padding: 1rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-medium")};
`;

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateImage = styled.img`
  display: block;
  opacity: 0.5;
`;

export const EmptyStateTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: 700;
`;
