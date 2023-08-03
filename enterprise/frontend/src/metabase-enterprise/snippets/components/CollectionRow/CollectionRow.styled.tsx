import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface CollectionRowRootProps {
  isArchived?: boolean;
}

export const CollectionRowRoot = styled.div<CollectionRowRootProps>`
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  color: ${color("brand")};
  cursor: ${props => !props.isArchived && "pointer"};

  &:hover {
    background-color: ${props => !props.isArchived && color("bg-light")};
  }
`;
