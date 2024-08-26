import { memo } from "react";

import type { ITreeNodeItem } from "metabase/components/tree/types";
import Text from "metabase/components/type/Text";

import { EntityViewSwitch } from "../EntityViewSwitch";
import { FilterableTree } from "../FilterableTree";

import {
  BackButton,
  BackIcon,
  SidebarHeader,
} from "./PermissionsSidebar.styled";
import { SidebarContentTitle } from "./PermissionsSidebarContent.styled";

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
            <SidebarContentTitle>{title}</SidebarContentTitle>
          )}
          {description && <Text color="text-dark">{description}</Text>}
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
