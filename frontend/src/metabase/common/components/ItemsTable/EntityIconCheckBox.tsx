import cx from "classnames";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Swapper } from "metabase/common/components/Swapper";
import type { IconData } from "metabase/common/utils/icon";
import { Checkbox, type IconProps } from "metabase/ui";

import S from "./EntityIconCheckBox.module.css";

type EntityIconCheckBoxProps = {
  variant?: string;
  icon: IconProps | IconData;
  pinned?: boolean;
  selectable?: boolean;
  selected?: boolean;
  showCheckbox?: boolean;
  disabled?: boolean;
  onToggleSelected?: () => void;
};
export const EntityIconCheckBox = ({
  variant,
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
  ...props
}: EntityIconCheckBoxProps) => {
  const iconSize = variant === "small" ? 12 : 16;
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    onToggleSelected?.();
    // helps keyboard shortcuts work for collection items
    e.currentTarget.focus();
  };

  return (
    <IconButtonWrapper
      className={cx(S.iconWrapper, {
        [S.pinned]: pinned,
        [S.disabled]: disabled,
      })}
      onClick={selectable ? handleClick : () => {}}
      disabled={disabled}
      {...props}
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
              size={iconSize === 12 ? "xs" : "sm"}
              // Visual-only; clicks are handled by the wrapping button.
              style={{ pointerEvents: "none" }}
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
