import cx from "classnames";
import type { MouseEvent } from "react";

import { IconContainer } from "metabase/components/MetadataInfo/InfoIcon/InfoIcon.styled";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

type WidgetStatusIconProps = {
  name: "close" | "empty" | "chevrondown" | "time_history";
  onClick?: () => void;
};

export function WidgetStatusIcon({ name, onClick }: WidgetStatusIconProps) {
  const classes = cx(CS.flexAlignRight, CS.flexNoShrink, {
    [CS.cursorPointer]: ["close", "time_history"].includes(name),
  });

  const handleOnClick = (e: MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <IconContainer>
      <Icon name={name} onClick={handleOnClick} className={classes} />
    </IconContainer>
  );
}
