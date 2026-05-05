import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import S from "./QueryButton.module.css";

interface QueryButtonProps {
  className?: string;
  text: string;
  icon: IconName;
  iconClass?: string;
  link: string;
}

const QueryButtonInner = ({
  className,
  text,
  icon,
  link,
}: QueryButtonProps) => (
  <div className={className}>
    <Link
      className={cx(S.queryButton, CS.bgLightHover, CS.px1, CS.rounded)}
      to={link}
    >
      <Icon name={icon} />
      <span className={S.queryButtonText}>{text}</span>
    </Link>
  </div>
);

export const QueryButton = memo(QueryButtonInner);
