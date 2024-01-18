import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "enter_or_return" | "empty" | "chevrondown";
  onClick?: () => void;
};

export function WidgetStatusIcon({ name, onClick }: Props) {
  const classes: Record<Props["name"], string> = {
    close: "flex-align-right cursor-pointer flex-no-shrink",
    enter_or_return: "flex-align-right flex-no-shrink",
    empty: "flex-align-right cursor-pointer flex-no-shrink",
    chevrondown: "flex-align-right flex-no-shrink",
  };

  return (
    <Icon name={name} onClick={onClick} size={12} className={classes[name]} />
  );
}
