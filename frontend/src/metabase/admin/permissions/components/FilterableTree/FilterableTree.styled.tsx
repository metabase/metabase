// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Tree } from "metabase/common/components/tree";
import { color } from "metabase/ui/utils/colors";

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
  border-top: 1px solid var(--mb-color-border);
`;

export const EmptyStateContainer = styled.div`
  margin-top: 6.25rem;
`;

export const AdminTreeNode = styled(Tree.Node)`
  color: ${(props) =>
    // TODO: We should really come up with a better solution for this, but since admin-navbar is currently not determined by
    // user whitelabelling, this is somewhat safe (and consistent with what is in the admin header nav)
    props.isSelected ? "var(--mantine-color-white)" : color("text-secondary")};
  background-color: ${(props) =>
    props.isSelected ? color("admin-navbar") : "unset"};

  &:hover {
    background-color: ${(props) =>
      props.isSelected
        ? color("admin-navbar")
        : color("admin-navbar-secondary")};
  }
`;
