import cx from "classnames";
import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "empty" | "chevrondown";
  onClick?: () => void;
};

export function WidgetStatusIcon({ name, onClick }: Props) {
  const classes = cx("flex-align-right flex-no-shrink", {
    "cursor-pointer": name === "close",
  });

  const handleOnClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <Icon name={name} onClick={handleOnClick} size={12} className={classes} />
  );
}
