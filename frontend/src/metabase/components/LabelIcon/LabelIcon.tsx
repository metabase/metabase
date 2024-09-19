import cx from "classnames";

import { Icon, type IconName } from "metabase/ui";

import S from "./LabelIcon.module.css";

interface LabelIconProps {
  className?: string;
  icon: IconName;
  size?: number;
}

const LabelIcon = ({ icon, size = 16, className }: LabelIconProps) =>
  icon.charAt(0) === "#" ? (
    <span
      className={cx(S.icon, S.colorIcon, className)}
      style={{ backgroundColor: icon, width: size, height: size }}
    />
  ) : (
    <Icon className={cx(S.icon, className)} name={icon} />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LabelIcon;
