import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";
import { Link } from "react-router";

import { Sortable } from "metabase/core/components/Sortable";
import { Flex, Group, Icon, type IconName, Text, rem } from "metabase/ui";

import S from "./SortableFieldItem.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  href?: string;
  icon: IconName;
  id: UniqueIdentifier;
  label: string;
}

export const SortableFieldItem = ({
  active,
  disabled,
  href,
  icon,
  id,
  label,
}: Props) => {
  const draggable = !disabled;

  return (
    <Sortable
      className={S.sortableField}
      disabled={disabled}
      draggingStyle={{ opacity: 0.5 }}
      id={id}
    >
      <Flex
        align="center"
        aria-label={label}
        bg="bg-white"
        c="text-medium"
        className={cx(S.content, {
          [S.active]: active,
          [S.draggable]: draggable,
        })}
        component={href ? Link : undefined}
        draggable={draggable}
        gap="md"
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
      >
        <Group flex="0 0 auto" gap="sm" wrap="nowrap">
          <Icon className={S.icon} name={icon} />

          <Text flex="1" fw="bold" lh="normal" mr="xs">
            {label}
          </Text>
        </Group>

        {draggable && <Icon className={S.grabber} name="grabber" />}
      </Flex>
    </Sortable>
  );
};
