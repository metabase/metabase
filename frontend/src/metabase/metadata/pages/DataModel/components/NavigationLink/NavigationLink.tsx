import cx from "classnames";

import Link from "metabase/common/components/Link";
import { Flex, Icon, type IconName } from "metabase/ui";

import S from "./NavigationLink.module.css";

type NavigationLinkProps = {
  label: string;
  icon: IconName;
  active: boolean;
  to: string;
};

export const NavigationLink = ({
  label,
  icon,
  active,
  to,
}: NavigationLinkProps) => {
  return (
    <Flex
      className={cx(S.link, { [S.active]: active })}
      component={Link}
      gap="sm"
      p="sm"
      to={to}
    >
      <Icon name={icon} className={S.icon} />
      {label}
    </Flex>
  );
};
