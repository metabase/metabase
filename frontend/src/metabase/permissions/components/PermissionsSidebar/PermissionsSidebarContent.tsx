import { memo } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { Box, Text } from "metabase/ui";

import { EntityViewSwitch } from "../EntityViewSwitch";
import { FilterableTree } from "../FilterableTree";

import S from "./PermissionsSidebarContent.module.css";

export interface PermissionsSidebarContentProps {
  title?: string;
  description?: string;
  filterPlaceholder: string;
  onSelect: (item: ITreeNodeItem) => void;
  selectedId?: ITreeNodeItem["id"];
  entityGroups: ITreeNodeItem[][];
  onEntityChange?: (entity: string) => void;
  entityViewFocus?: "database" | "group";
}

export const PermissionsSidebarContent = memo(
  function PermissionsSidebarContent({
    title,
    description,
    filterPlaceholder,
    entityGroups,
    entityViewFocus,
    selectedId,
    onEntityChange,
    onSelect,
  }: PermissionsSidebarContentProps) {
    return (
      <>
        <Box pt="md" px="xl" flex="0 0 auto">
          {title && <div className={S.SidebarContentTitle}>{title}</div>}
          {description && (
            <Text lh="normal" c="text-primary">
              {description}
            </Text>
          )}
          {entityViewFocus && onEntityChange && (
            <EntityViewSwitch
              value={entityViewFocus}
              onChange={onEntityChange}
            />
          )}
        </Box>
        <FilterableTree
          placeholder={filterPlaceholder}
          onSelect={onSelect}
          itemGroups={entityGroups}
          selectedId={selectedId}
        />
      </>
    );
  },
);
