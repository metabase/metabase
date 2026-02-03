import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import type { IconName } from "metabase/ui";

import {
  NodeListItemIcon,
  NodeListItemId,
  NodeListItemLink,
  NodeListItemName,
} from "./NodeList";
import S from "./ResourceTreeNode.module.css";

export const ResourceTreeNode = ({
  item,
  depth,
  isExpanded,
  displayId = false,
  onToggleExpand,
  onItemClick,
}: TreeNodeProps<ITreeNodeItem> & {
  displayId?: boolean;
  onItemClick: () => void;
}) => {
  const isRoot = depth === 0;
  const onClick = () => (isRoot ? onToggleExpand() : onItemClick());

  return (
    <NodeListItemLink
      onClick={onClick}
      className={S.ResourceListItem}
      data-is-root={isRoot}
      data-is-expanded={isExpanded}
    >
      {isRoot && <NodeListItemIcon name="chevronright" data-role="chevron" />}
      <NodeListItemIcon name={item.icon as IconName} />
      <NodeListItemName>{item.name}</NodeListItemName>
      {!isRoot && displayId && <NodeListItemId>{`#${item.id}`}</NodeListItemId>}
    </NodeListItemLink>
  );
};
