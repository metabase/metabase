import { useCallback } from "react";
import cx from "classnames";
import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "enter_or_return" | "empty" | "chevrondown";
  onClick?: () => void;
};

export function WidgetStatusIcon({ name, onClick }: Props) {
  const classes = cx(
    "flex-align-right flex-no-shrink",
    name === "close" && "cursor-pointer",
  );

  const handleOnClick = useCallback(
    e => {
      if (onClick) {
        e.stopPropagation();
        onClick();
      }
    },
    [onClick],
  );

  return (
    <Icon name={name} onClick={handleOnClick} size={12} className={classes} />
  );
}
