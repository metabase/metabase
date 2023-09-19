import { t } from "ttag";

import type { IconName } from "metabase/core/components/Icon";

import CheckBox from "metabase/core/components/CheckBox";
import Swapper from "metabase/core/components/Swapper";
import Tooltip from "metabase/core/components/Tooltip";

import { color as c } from "metabase/lib/colors";
import { ActionIcon, ItemIcon, ItemIconContainer } from "./ArchivedItem.styled";

interface ArchivedItemProps {
  name: string;
  type: string;
  icon: IconName;
  color?: string;
  isAdmin: boolean;
  onUnarchive?: () => void;
  onDelete?: () => void;
  selected: boolean;
  onToggleSelected: () => void;
  showSelect: boolean;
}

export const ArchivedItem = ({
  name,
  type,
  icon,
  color = c("text-light"),
  isAdmin = false,
  onUnarchive,
  onDelete,
  selected,
  onToggleSelected,
  showSelect,
}: ArchivedItemProps) => (
  <div
    className="flex align-center p2 hover-parent hover--visibility border-bottom bg-light-hover"
    data-testid={`archive-item-${name}`}
  >
    <Swapper
      aria-label={"archive-item-swapper"}
      defaultElement={
        <ItemIconContainer>
          <ItemIcon name={icon} color={color} />
        </ItemIconContainer>
      }
      swappedElement={
        <ItemIconContainer>
          <CheckBox checked={selected} onChange={onToggleSelected} />
        </ItemIconContainer>
      }
      isSwapped={showSelect}
    />
    {name}
    {isAdmin && (onUnarchive || onDelete) && (
      <span className="ml-auto mr2">
        {onUnarchive && (
          <Tooltip tooltip={t`Unarchive this ${type}`}>
            <ActionIcon
              onClick={onUnarchive}
              className="hover-child"
              name="unarchive"
            />
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip tooltip={t`Delete this ${type}`}>
            <ActionIcon
              onClick={onDelete}
              className="hover-child"
              name="trash"
            />
          </Tooltip>
        )}
      </span>
    )}
  </div>
);
