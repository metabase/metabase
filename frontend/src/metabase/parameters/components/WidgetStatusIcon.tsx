import cx from "classnames";
import type { MouseEvent } from "react";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "empty" | "chevrondown" | "time_history";
  onClick?: () => void;
  size?: number;
};

export function WidgetStatusIcon({ name, size, onClick }: Props) {
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
    <Icon
      name={name}
      onClick={handleOnClick}
      size={size ?? 12}
      className={classes}
    />
  );
}
