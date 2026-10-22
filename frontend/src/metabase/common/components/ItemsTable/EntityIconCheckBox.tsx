import cx from "classnames";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Swapper } from "metabase/common/components/Swapper";
import type { IconData } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { Center, Checkbox, type IconProps, Skeleton } from "metabase/ui";

import S from "./EntityIconCheckBox.module.css";

const LIST_ICON_SIZE = 16;

type EntityIconCheckBoxProps = {
  variant?: "list" | "small";
  icon: IconProps | IconData;
  pinned?: boolean;
  selectable?: boolean;
  selected?: boolean;
  showCheckbox?: boolean;
  disabled?: boolean;
  onToggleSelected?: () => void;
};
export const EntityIconCheckBox = ({
  variant = "list",
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
}: EntityIconCheckBoxProps) => {
  const isSmall = variant === "small";
  const iconSize = isSmall ? 12 : LIST_ICON_SIZE;
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    onToggleSelected?.();
    // helps keyboard shortcuts work for collection items
    e.currentTarget.focus();
  };

  return (
    <IconButtonWrapper
      className={cx(S.iconSlot, S.iconWrapper, {
        [S.pinned]: pinned,
        [S.disabled]: disabled,
      })}
      onClick={selectable ? handleClick : () => {}}
      disabled={disabled}
    >
      {selectable ? (
        <Swapper
          defaultElement={
            <EntityIcon
              {...icon}
              color={icon.color ?? "inherit"}
              size={iconSize}
            />
          }
          swappedElement={
            <Checkbox
              checked={selected}
              // Visual-only; clicks are handled by the wrapping button.
              className={CS.pointerEventsNone}
            />
          }
          isSwapped={selected || showCheckbox}
        />
      ) : (
        <EntityIcon {...icon} color={icon.color ?? "inherit"} size={iconSize} />
      )}
    </IconButtonWrapper>
  );
};

export const EntityIconCheckBoxSkeleton = () => (
  <Center className={S.iconSlot}>
    <Skeleton h={LIST_ICON_SIZE} w={LIST_ICON_SIZE} />
  </Center>
);
