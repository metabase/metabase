import cx from "classnames";
import { Link } from "react-router";

import { Flex, Icon, type IconName, Text, rem } from "metabase/ui";

import S from "./FieldItem.module.css";

interface Props {
  active?: boolean;
  href?: string;
  icon: IconName;
  label: string;
}

export const FieldItem = ({ active, href, icon, label }: Props) => {
  return (
    <Flex
      align="center"
      aria-label={label}
      bg="bg-white"
      c="text-medium"
      className={cx(S.field, {
        [S.active]: active,
      })}
      component={href ? Link : undefined}
      gap="sm"
      justify="space-between"
      mih={rem(40)}
      pos="relative"
      px="md"
      py={12}
      role="listitem"
      // "to" prop should be undefined when Link component is not used.
      // Types do not account for conditional Link usage, hence cast.
      to={href ? href : (undefined as unknown as string)}
      w="100%"
      wrap="nowrap"
    >
      <Icon className={S.icon} name={icon} />

      <Text flex="1" fw="bold" lh="normal" mr="xs">
        {label}
      </Text>
    </Flex>
  );
};
