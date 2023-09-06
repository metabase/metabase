import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ObjectRelationships = styled.div`
  overflow-y: auto;
  flex: 0 0 100%;
  padding: 2rem;
  background-color: ${color("bg-light")};
`;

export interface ObjectRelationshipContentProps {
  isClickable: boolean;
}

export const ObjectRelationContent = styled.div<ObjectRelationshipContentProps>`
  display: flex;
  align-items: center;
  margin: 1rem 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${color("border")};
  color: ${props => color(props.isClickable ? "text-dark" : "text-medium")};
  cursor: ${props => props.isClickable && "pointer"};

  &:hover {
    color: ${props => props.isClickable && color("brand")};
  }
`;
