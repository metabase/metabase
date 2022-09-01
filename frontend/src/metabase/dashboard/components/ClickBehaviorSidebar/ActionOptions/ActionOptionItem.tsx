import React from "react";

import { SidebarItem } from "../SidebarItem";
import {
  ActionSidebarItem,
  ActionSidebarItemIcon,
  ActionDescription,
} from "./ActionOptions.styled";

interface ActionOptionProps {
  name: string;
  description?: string | null;
  isSelected: boolean;
  onClick: () => void;
}

function ActionOptionItem({
  name,
  description,
  isSelected,
  onClick,
}: ActionOptionProps) {
  return (
    <ActionSidebarItem
      onClick={onClick}
      isSelected={isSelected}
      hasDescription={!!description}
    >
      <ActionSidebarItemIcon name="bolt" isSelected={isSelected} />
      <div>
        <SidebarItem.Name>{name}</SidebarItem.Name>
        {description && <ActionDescription>{description}</ActionDescription>}
      </div>
    </ActionSidebarItem>
  );
}

export default ActionOptionItem;
