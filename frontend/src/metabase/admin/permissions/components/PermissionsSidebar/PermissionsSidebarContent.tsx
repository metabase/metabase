import { memo } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { Text } from "metabase/ui";

import { EntityViewSwitch } from "../EntityViewSwitch";
import { FilterableTree } from "../FilterableTree";

import {
  BackButton,
  BackIcon,
  SidebarHeader,
} from "./PermissionsSidebar.styled";
import S from "./PermissionsSidebarContent.module.css";

export interface PermissionsSidebarContentProps {
  title?: string;
  description?: string;
  filterPlaceholder: string;
  onSelect: (item: ITreeNodeItem) => void;
  onBack?: () => void;
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
    onBack,
  }: PermissionsSidebarContentProps) {
    return (
      <>
        <SidebarHeader>
          {onBack ? (
            <BackButton onClick={onBack}>
              <BackIcon name="arrow_left" />
              {title}
            </BackButton>
          ) : (
            <div className={S.SidebarContentTitle}>{title}</div>
          )}
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
        </SidebarHeader>
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
