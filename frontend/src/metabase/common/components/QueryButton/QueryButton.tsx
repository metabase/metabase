import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Icon, type IconName } from "metabase/ui";

import S from "./QueryButton.module.css";

type QueryButtonProps = {
  className?: string;
  icon: IconName;
  text: string;
  onClick?: () => void;
  link?: string;
};

const QueryButtonInner = ({
  className,
  text,
  icon,
  onClick,
  link = "",
}: QueryButtonProps) => (
  <div className={className}>
    <Link
      className={cx(S.queryButton, CS.bgLightHover, CS.px1, CS.rounded)}
      onClick={onClick}
      to={link}
    >
      <Icon name={icon} />
      <span className={S.queryButtonText}>{text}</span>
    </Link>
  </div>
);

export const QueryButton = memo(QueryButtonInner);
