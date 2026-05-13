import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { QUERY_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import {
  Box,
  Ellipsified,
  Icon,
  type IconName,
  Input,
  Loader,
  type RenderTreeNodePayload,
  Stack,
  Text,
  TextInput,
  Tree,
  UnstyledButton,
  useTree,
} from "metabase/ui";
import type { Exploration, ExplorationQueryStatus } from "metabase-types/api";

import type { SelectedEntity } from "../../pages/ExplorationPage";
import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./ExplorationSidebar.module.css";
import {
  DOCUMENT_TREE_ID_PREFIX,
  type ExplorationTreeNodePayloadHeading,
  type ExplorationTreeNodePayloadItem,
  filterExplorationTree,
  getDocumentTreeId,
  getExplorationSidebarTree,
  isExplorationTreeNodePayloadHeading,
  isExplorationTreeNodePayloadItem,
  removeDocumentTreeIdPrefix,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedEntity: SelectedEntity | null;
  setSelectedEntity: (entity: SelectedEntity) => void;
}

export function ExplorationSidebar({
  exploration,
  selectedEntity,
  setSelectedEntity,
}: ExplorationSidebarProps) {
  const [searchFilter, setSearchFilter] = useState("");

  const treeData = useMemo(
    () => getExplorationSidebarTree(exploration),
    [exploration],
  );

  const filteredTreeData = useMemo(
    () => filterExplorationTree(treeData, searchFilter),
    [treeData, searchFilter],
  );

  const tree = useTree({
    initialSelectedState:
      selectedEntity?.type === "document"
        ? [getDocumentTreeId(selectedEntity.id)]
        : selectedEntity?.type === "group"
          ? selectedEntity.ids
          : undefined,
  });

  useEffect(() => {
    if (tree.selectedState.length === 1) {
      const id = tree.selectedState[0];
      if (id.startsWith(DOCUMENT_TREE_ID_PREFIX)) {
        const documentId = removeDocumentTreeIdPrefix(id);
        if (
          selectedEntity?.type !== "document" ||
          documentId !== selectedEntity?.id
        ) {
          setSelectedEntity({ type: "document", id: documentId });
        }
        return;
      }
    }
    const groupIds = tree.selectedState.filter(
      (id) => !id.startsWith(DOCUMENT_TREE_ID_PREFIX),
    );
    if (
      selectedEntity?.type !== "group" ||
      selectedEntity.ids.length !== groupIds.length ||
      !selectedEntity.ids.every((id) => groupIds.includes(id))
    ) {
      setSelectedEntity({ type: "group", ids: groupIds });
    }
  }, [tree.selectedState, selectedEntity, setSelectedEntity]);

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
      <TextInput
        value={searchFilter}
        onChange={(e) => setSearchFilter(e.currentTarget.value)}
        placeholder={t`Search…`}
        leftSection={<Icon name="search" c="text-secondary" />}
        rightSectionPointerEvents="all"
        rightSection={
          searchFilter ? (
            <Input.ClearButton
              c="text-secondary"
              onClick={() => setSearchFilter("")}
            />
          ) : (
            <div />
          )
        }
      />
      <Box className={S.tree}>
        <Tree
          tree={tree}
          data={filteredTreeData}
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
