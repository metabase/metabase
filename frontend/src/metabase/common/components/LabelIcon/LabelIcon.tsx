import cx from "classnames";

import { Icon, type IconName } from "metabase/ui";

import S from "./LabelIcon.module.css";

type LabelIconProps = {
  icon: IconName | `#${string}`;
  size?: number;
  className?: string;
};

export function LabelIcon({ icon, size = 16, className }: LabelIconProps) {
  const isColor = icon.startsWith("#");

  if (isColor) {
    return (
      <span
        className={cx(S.icon, S.colorIcon, className)}
        style={{ backgroundColor: icon, width: size, height: size }}
      />
    );
  }

  return <Icon className={cx(S.icon, className)} name={icon as IconName} />;
}
