// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/ui/utils/colors";

export const ObjectRelationships = styled.div`
  overflow-y: auto;
  flex: 0 0 100%;
  padding: 2rem;
  background-color: var(--mb-color-background-secondary);
`;

interface ObjectRelationshipContentProps {
  isClickable: boolean;
}

export const ObjectRelationContent = styled.div<ObjectRelationshipContentProps>`
  display: flex;
  align-items: center;
  margin: 1rem 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--mb-color-border);
  color: ${(props) =>
    color(props.isClickable ? "text-primary" : "text-secondary")};
  cursor: ${(props) => props.isClickable && "pointer"};

  &:hover {
    color: ${(props) => props.isClickable && "var(--mb-color-brand)"};
  }
`;
