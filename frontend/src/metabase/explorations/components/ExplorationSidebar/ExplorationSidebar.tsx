import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { QUERY_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import {
  Box,
  Ellipsified,
  Icon,
  type IconName,
  type IconProps,
  Loader,
  type RenderTreeNodePayload,
  Stack,
  Text,
  Tree,
  UnstyledButton,
  useTree,
} from "metabase/ui";
import type { Exploration, ExplorationQueryStatus } from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";
import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./ExplorationSidebar.module.css";
import {
  DOCUMENT_TREE_ID_PREFIX,
  type ExplorationTreeNodePayloadHeading,
  type ExplorationTreeNodePayloadItem,
  flattenTree,
  getDocumentTreeId,
  getExplorationSidebarTree,
  isExplorationTreeNodePayloadHeading,
  isExplorationTreeNodePayloadItem,
  removeDocumentTreeIdPrefix,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
}

export function ExplorationSidebar({
  exploration,
  selectedEntityId,
  setSelectedEntityId,
}: ExplorationSidebarProps) {
  const treeData = useMemo(
    () => getExplorationSidebarTree(exploration),
    [exploration],
  );

  const tree = useTree({
    initialSelectedState:
      selectedEntityId?.type === "document"
        ? [getDocumentTreeId(selectedEntityId.id)]
        : selectedEntityId?.type === "group"
          ? [selectedEntityId.id]
          : undefined,
  });

  useEffect(() => {
    if (tree.selectedState.length === 1) {
      const id = tree.selectedState[0];
      if (id.startsWith(DOCUMENT_TREE_ID_PREFIX)) {
        const documentId = removeDocumentTreeIdPrefix(id);
        if (documentId !== selectedEntityId?.id) {
          setSelectedEntityId({ type: "document", id: documentId });
        }
      } else {
        const groupId = id;
        if (groupId !== selectedEntityId?.id) {
          setSelectedEntityId({ type: "group", id: groupId });
        }
      }
    }
  }, [tree.selectedState, selectedEntityId, setSelectedEntityId]);

  // const flatItems = useMemo(() => flattenTree(treeData), [treeData]);

  // useEffect(() => {
  //   const handleKeyDown = (event: KeyboardEvent) => {
  //     if (selectedEntityId == null) {
  //       return;
  //     }
  //     if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
  //       return;
  //     }
  //     if (shouldIgnoreKeyboardEvent(event)) {
  //       return;
  //     }
  //     const direction = event.key === "ArrowRight" ? 1 : -1;
  //     const nextItem = getAdjacentById(
  //       flatItems,
  //       selectedEntityId.id,
  //       direction,
  //     );
  //     if (nextItem != null && nextItem.id !== selectedEntityId.id) {
  //       if (nextItem.data?.type === "group") {
  //         setSelectedEntityId({ type: "group", id: nextItem.data.group_id });
  //       } else if (nextItem.data?.type === "document") {
  //         setSelectedEntityId({ type: "document", id: nextItem.data.id });
  //       }
  //       event.preventDefault();
  //     }
  //   };
  //   window.addEventListener("keydown", handleKeyDown);
  //   return () => window.removeEventListener("keydown", handleKeyDown);
  // }, [flatItems, selectedEntityId, setSelectedEntityId]);

  return (
    <Stack h="100%" w="20%" flex="none" gap="lg" pt="3rem" mr="2rem">
      <Text size="xl" fw="bold" pl="0.75rem">
        {exploration.name}
      </Text>
      <Box className={S.tree}>
        <Tree
          tree={tree}
          data={treeData}
          renderNode={ExplorationTreeNode}
          selectOnClick
        />
      </Box>
    </Stack>
  );
}

function ExplorationTreeNode(props: RenderTreeNodePayload) {
  if (isExplorationTreeNodePayloadHeading(props)) {
    return <ExplorationTreeHeading {...props} />;
  }
  if (isExplorationTreeNodePayloadItem(props)) {
    return <ExplorationTreeItem {...props} />;
  }
  return null;
}

function ExplorationTreeHeading({
  node,
  expanded,
  elementProps,
  level,
}: ExplorationTreeNodePayloadHeading) {
  return (
    <UnstyledButton
      {...elementProps}
      aria-expanded={expanded}
      className={S.treeRow}
      style={{ marginLeft: level * 16 }}
    >
      <Icon
        name={expanded ? "chevrondown" : "chevronright"}
        c="brand"
        aria-hidden
      />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {node.label}
      </Ellipsified>
    </UnstyledButton>
  );
}

function ExplorationTreeItem({
  node,
  selected,
  elementProps,
  level,
  tree,
}: ExplorationTreeNodePayloadItem) {
  return (
    <UnstyledButton
      {...elementProps}
      role="listitem"
      aria-pressed={selected}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: selected,
      })}
      style={{ marginLeft: level * 16 }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          tree.setSelectedState((prev) =>
            prev.includes(node.value)
              ? prev.filter((id) => id !== node.value)
              : [...prev, node.value],
          );
          return;
        }
        elementProps.onClick(e);
      }}
    >
      <ExplorationTreeItemIcon
        status={node.data.status}
        icon={node.data.type === "group" ? "lineandbar" : "document"}
      />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {node.label}
      </Ellipsified>
      {node.data.type === "group" &&
        (node.data.interestingness_score ?? 0) >
          QUERY_INTERESTINGNESS_SCORE_THRESHOLD && (
          <PotentiallyInterestingMarker />
        )}
    </UnstyledButton>
  );
}

function ExplorationTreeItemIcon({
  status,
  icon,
}: {
  status: ExplorationQueryStatus | undefined;
  icon: IconName;
}) {
  if (status === "running" || status === "pending") {
    return <Loader size="xs" aria-label={t`Loading…`} />;
  }
  if (status === "error") {
    return <Icon name="warning" c="error" aria-label={t`Failed to generate`} />;
  }
  return <Icon name={icon} c="text-secondary" aria-label={t`Ready`} />;
}
