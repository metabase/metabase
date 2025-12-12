import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

import type {
  FlatTreeNode,
  NodeId,
  TreeExpansion,
  TreeKeyboardNav,
  TreeNodeData,
  TreeSelection,
  TreeVirtualization,
} from "../types";

/** Options for keyboard navigation behavior */
export interface UseTreeKeyboardNavOptions<TData extends TreeNodeData> {
  /** Flattened visible nodes */
  flatNodes: FlatTreeNode<TData>[];
  /** Map for node lookup */
  nodeById: Map<NodeId, FlatTreeNode<TData>>;
  /** Expansion state (for arrow left/right) */
  expansion: TreeExpansion;
  /** Selection state (for space/enter) */
  selection: TreeSelection<TData>;
  /** Virtualization (for scrolling to active row) */
  virtualization: TreeVirtualization;
  /** Enable/disable keyboard navigation */
  enableKeyboardNav?: boolean;
  /** Controlled active node ID */
  activeId?: NodeId | null;
  /** Callback when active node changes */
  onActiveChange?: (id: NodeId | null) => void;
}

/**
 * Implements WAI-ARIA treegrid keyboard navigation pattern.
 *
 * Key bindings:
 * - Arrow Up/Down: Move to previous/next row
 * - Arrow Left: Collapse node or move to parent
 * - Arrow Right: Expand node or move to first child
 * - Home/End: Move to first/last row
 * - Space: Toggle selection (multi mode)
 * - Enter: Toggle expansion or selection
 * - Ctrl/Cmd+A: Select all (multi mode)
 * - Escape: Deselect all
 */
export function useTreeKeyboardNav<TData extends TreeNodeData>({
  flatNodes,
  nodeById,
  expansion,
  selection,
  virtualization,
  enableKeyboardNav = true,
  activeId: controlledActiveId,
  onActiveChange,
}: UseTreeKeyboardNavOptions<TData>): TreeKeyboardNav {
  const [internalActiveId, setInternalActiveId] = useState<NodeId | null>(null);

  const isControlled = controlledActiveId !== undefined;
  const activeId = isControlled ? controlledActiveId : internalActiveId;

  const activeIndex =
    activeId !== null ? flatNodes.findIndex((n) => n.id === activeId) : -1;

  const setActiveId = useCallback(
    (id: NodeId | null) => {
      if (!isControlled) {
        setInternalActiveId(id);
      }
      onActiveChange?.(id);

      if (id !== null) {
        virtualization.scrollToNode(id);
      }
    },
    [isControlled, onActiveChange, virtualization],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!enableKeyboardNav) {
        return;
      }

      const { code, shiftKey } = event;
      const currentNode = activeId !== null ? nodeById.get(activeId) : null;
      const currentIndex = currentNode?.index ?? -1;

      switch (code) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, flatNodes.length - 1);
          if (nextIndex >= 0 && nextIndex < flatNodes.length) {
            setActiveId(flatNodes[nextIndex].id);
          }
          break;
        }

        case "ArrowUp": {
          event.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          if (prevIndex >= 0 && prevIndex < flatNodes.length) {
            setActiveId(flatNodes[prevIndex].id);
          }
          break;
        }

        case "ArrowRight": {
          event.preventDefault();
          if (currentNode) {
            if (currentNode.hasChildren && !currentNode.isExpanded) {
              expansion.expand(currentNode.id);
            } else if (currentNode.isExpanded) {
              const nextIndex = currentIndex + 1;
              if (nextIndex < flatNodes.length) {
                setActiveId(flatNodes[nextIndex].id);
              }
            }
          }
          break;
        }

        case "ArrowLeft": {
          event.preventDefault();
          if (currentNode) {
            if (currentNode.isExpanded) {
              expansion.collapse(currentNode.id);
            } else if (currentNode.parentId !== null) {
              setActiveId(currentNode.parentId);
            }
          }
          break;
        }

        case "Home": {
          event.preventDefault();
          if (flatNodes.length > 0) {
            setActiveId(flatNodes[0].id);
          }
          break;
        }

        case "End": {
          event.preventDefault();
          if (flatNodes.length > 0) {
            setActiveId(flatNodes[flatNodes.length - 1].id);
          }
          break;
        }

        case "Space": {
          event.preventDefault();
          if (currentNode && selection.selectionMode !== "none") {
            const syntheticEvent = { shiftKey } as unknown as React.MouseEvent;
            selection.toggle(currentNode.id, syntheticEvent);
          }
          break;
        }

        case "Enter": {
          event.preventDefault();
          if (currentNode) {
            if (currentNode.hasChildren) {
              expansion.toggle(currentNode.id);
            } else if (selection.selectionMode !== "none") {
              selection.toggle(currentNode.id);
            }
          }
          break;
        }

        case "KeyA": {
          if (
            (event.metaKey || event.ctrlKey) &&
            selection.selectionMode === "multi"
          ) {
            event.preventDefault();
            selection.selectAll();
          }
          break;
        }

        case "Escape": {
          event.preventDefault();
          selection.deselectAll();
          break;
        }

        default:
          break;
      }
    },
    [
      enableKeyboardNav,
      activeId,
      nodeById,
      flatNodes,
      expansion,
      selection,
      setActiveId,
    ],
  );

  return {
    activeId,
    activeIndex,
    setActiveId,
    handleKeyDown,
  };
}
