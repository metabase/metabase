import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { Ellipsified, Group, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./Breadcrumb.module.css";

interface Props {
  children: ReactNode;
  icon: IconName;
  to: string;
}

export const Breadcrumb = ({ children, icon, to }: Props) => {
  return (
    <Link className={S.breadcrumb} style={{ minWidth: 0 }} to={to}>
      <Group align="center" className={S.content} gap="xs" wrap="nowrap">
        <Icon flex="0 0 auto" name={icon} />

        <Ellipsified fw="bold" fz="sm" lh="normal">
          {children}
        </Ellipsified>
      </Group>
    </Link>
  );
};
