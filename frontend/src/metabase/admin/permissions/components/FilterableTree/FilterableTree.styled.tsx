// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { type CSSProperties, forwardRef } from "react";

import { usePermissionsSelectionColors } from "metabase/admin/permissions/utils/selection-color";
import { Tree } from "metabase/common/components/tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
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
  border-top: 1px solid var(--mb-color-border-neutral);
`;

export const EmptyStateContainer = styled.div`
  margin-top: 6.25rem;
`;

const StyledTreeNode = styled(Tree.Node)<{ style?: CSSProperties }>`
  color: ${(props) =>
    props.isSelected ? "var(--mantine-color-white)" : color("text-secondary")};
  background-color: ${(props) =>
    props.isSelected ? "var(--permissions-tree-node-selected)" : "unset"};

  &:hover {
    background-color: ${(props) =>
      props.isSelected
        ? "var(--permissions-tree-node-selected)"
        : "var(--permissions-tree-node-hover)"};
  }
`;

// Reads the selection colors from context rather than hardcoding admin's
// purple, so the embedding hub can mount this same tree with its own brand
// color. See `selection-color.tsx`.
export const AdminTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function AdminTreeNode(props, ref) {
    const { selected, hover } = usePermissionsSelectionColors();

    // CSS custom properties aren't part of React's CSSProperties type.
    const selectionColorVariables = {
      "--permissions-tree-node-selected": color(selected),
      "--permissions-tree-node-hover": color(hover),
    } as CSSProperties;

    return (
      <StyledTreeNode {...props} ref={ref} style={selectionColorVariables} />
    );
  },
);
