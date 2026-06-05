import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { Ellipsified, Group, Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import { resolveIconColor } from "metabase/ui/utils/colors";
import type { IconName } from "metabase-types/api";

import S from "./Breadcrumb.module.css";

interface Props {
  children: ReactNode;
  icon: IconName;
  iconColor?: ColorName;
  iconSize?: number;
  to?: string;
  onClick?: () => void;
}

export const Breadcrumb = ({
  children,
  icon,
  iconColor,
  iconSize,
  to,
  onClick,
}: Props) => {
  const content = (
    <Group
      align="center"
      className={S.content}
      gap="xs"
      style={{ "--active-color": resolveIconColor(iconColor) }}
      wrap="nowrap"
    >
      <Icon c={iconColor} flex="0 0 auto" name={icon} size={iconSize} />

      <Ellipsified fw="bold" lh="normal" showTooltip={false}>
        {children}
      </Ellipsified>
    </Group>
  );

  if (typeof to === "string") {
    return (
      <Link className={S.breadcrumb} to={to} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <span className={S.breadcrumb} onClick={onClick}>
      {content}
    </span>
  );
};
