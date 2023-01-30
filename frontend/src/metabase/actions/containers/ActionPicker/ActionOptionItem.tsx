import React from "react";

import Icon from "metabase/components/Icon";
import {
  ActionOptionListItem,
  ActionOptionTitle,
  ActionOptionDescription,
} from "./ActionOptionItem.styled";

interface ActionOptionProps {
  name: string;
  description?: string | null;
  isSelected: boolean;
  onClick: () => void;
}

export default function ActionOptionItem({
  name,
  description,
  isSelected,
  onClick,
}: ActionOptionProps) {
  return (
    <ActionOptionListItem
      onClick={onClick}
      isSelected={isSelected}
      hasDescription={!!description}
    >
      <Icon name="insight" size={22} />
      <div>
        <ActionOptionTitle>{name}</ActionOptionTitle>
        {!!description && (
          <ActionOptionDescription>{description}</ActionOptionDescription>
        )}
      </div>
    </ActionOptionListItem>
  );
}
