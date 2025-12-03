import type { TreeNodeProps } from "metabase/common/components/tree/types";
import type { IconName } from "metabase/ui";
import type { CollectionTreeItem } from "metabase-types/store";

import S from "./CollectionTreeNode.module.css";
import {
  NodeListItemIcon,
  NodeListItemId,
  NodeListItemLink,
  NodeListItemName,
} from "./NodeList";

export const CollectionTreeNode = ({
  item,
  depth,
  isExpanded,
  onToggleExpand,
  onItemClick,
}: TreeNodeProps<CollectionTreeItem> & {
  onItemClick: () => void;
}) => {
  const isRoot = depth === 0;
  const onClick = () => (isRoot ? onToggleExpand() : onItemClick());

  return (
    <NodeListItemLink
      onClick={onClick}
      className={S.CollectionListItem}
      data-is-root={isRoot}
      data-is-expanded={isExpanded}
    >
      {isRoot && <NodeListItemIcon name="chevronright" data-role="chevron" />}
      <NodeListItemIcon name={item.icon as IconName} />
      <NodeListItemName>{item.name}</NodeListItemName>
      {!isRoot && <NodeListItemId>{`#${item.id}`}</NodeListItemId>}
    </NodeListItemLink>
  );
};
