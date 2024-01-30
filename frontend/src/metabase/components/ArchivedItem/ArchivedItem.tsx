import { t } from "ttag";

import type { CollectionItemModel } from "metabase-types/api";
import type { IconName } from "metabase/ui";

import CheckBox from "metabase/core/components/CheckBox";
import Swapper from "metabase/core/components/Swapper";
import Tooltip from "metabase/core/components/Tooltip";

import { color as c } from "metabase/lib/colors";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";

import { ActionIcon, ItemIcon, ItemIconContainer } from "./ArchivedItem.styled";

interface ArchivedItemProps {
  name: string;
  model: CollectionItemModel;
  icon: IconName;
  color?: string;
  onUnarchive?: () => void;
  onDelete?: () => void;
  selected: boolean;
  onToggleSelected: () => void;
  showSelect: boolean;
}

export const ArchivedItem = ({
  name,
  model,
  icon,
  color = c("text-light"),
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
    {(onUnarchive || onDelete) && (
      <span className="ml-auto mr2">
        {onUnarchive && (
          <Tooltip
            tooltip={t`Unarchive this ${getTranslatedEntityName(
              model,
            )?.toLowerCase()}`}
          >
            <ActionIcon
              onClick={onUnarchive}
              className="hover-child"
              name="unarchive"
            />
          </Tooltip>
        )}
        {model !== "collection" && onDelete && (
          <Tooltip
            tooltip={t`Delete this ${getTranslatedEntityName(
              model,
            )?.toLowerCase()}`}
          >
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
