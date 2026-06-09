import cx from "classnames";
import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { Ellipsified, Group, Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import { color as getColor } from "metabase/ui/utils/colors";
import type { IconName } from "metabase-types/api";

import S from "./Breadcrumb.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  color?: ColorName;
  icon?: IconName;
  iconColor?: ColorName;
  iconSize?: number;
  to?: string;
  onClick?: () => void;
}

export const Breadcrumb = ({
  children,
  className,
  color,
  icon,
  iconColor,
  iconSize,
  to,
  onClick,
}: Props) => {
  const isLink = typeof to === "string" && to.length > 0;

  const content = (
    <Group
      align="center"
      className={cx(S.content, {
        [S.clickable]: isLink || onClick,
      })}
      gap="xs"
      style={{
        "--color": color ? getColor(color) : undefined,
        "--active-color": iconColor ? getColor(iconColor) : undefined,
      }}
      wrap="nowrap"
    >
      {icon && (
        <Icon
          c={iconColor}
          className={S.icon}
          flex="0 0 auto"
          name={icon}
          size={iconSize}
        />
      )}

      <Ellipsified
        c={undefined} // to avoid inline style with would have higher specificity than CSS in Breadcrumb.module.css
        className={S.text}
        fw="bold"
        lh="normal"
        showTooltip={false}
      >
        {children}
      </Ellipsified>
    </Group>
  );

  if (isLink) {
    return (
      <Link className={cx(S.breadcrumb, className)} to={to} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <span className={cx(S.breadcrumb, className)} onClick={onClick}>
      {content}
    </span>
  );
};
