import styled from "@emotion/styled";

import { Tree } from "metabase/components/tree";
import { color, lighten } from "metabase/lib/colors";

export const FilterableTreeRoot = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const FilterableTreeContainer = styled.div`
  overflow: auto;
`;

export const FilterInputContainer = styled.div`
  padding: 0.75rem 1.5rem;
`;

export const ItemGroupsDivider = styled.hr`
  margin: 1rem 1.5rem;
  border: 0;
  border-top: 1px solid ${color("border")};
`;

export const EmptyStateContainer = styled.div`
  margin-top: 6.25rem;
`;

export const AdminTreeNode = styled(Tree.Node)`
  color: ${props =>
    props.isSelected ? color("text-white") : color("text-medium")};
  background-color: ${props => (props.isSelected ? color("filter") : "unset")};

  &:hover {
    background-color: ${props =>
      props.isSelected ? color("filter") : lighten(color("filter"), 0.6)};
  }
`;
