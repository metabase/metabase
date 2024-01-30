import cx from "classnames";
import type { MouseEvent } from "react";
import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "empty" | "chevrondown" | "refresh";
  onClick?: () => void;
};

export function WidgetStatusIcon({ name, onClick }: Props) {
  const classes = cx("flex-align-right flex-no-shrink", {
    "cursor-pointer": ["close", "refresh"].includes(name),
  });

  const handleOnClick = (e: MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <Icon name={name} onClick={handleOnClick} size={12} className={classes} />
  );
}
