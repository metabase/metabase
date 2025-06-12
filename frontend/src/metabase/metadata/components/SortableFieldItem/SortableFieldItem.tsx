import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";

import { Sortable } from "metabase/core/components/Sortable";
import { Flex, Group, Icon, type IconName, Text, rem } from "metabase/ui";

import S from "./SortableFieldItem.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  icon: IconName;
  id: UniqueIdentifier;
  label: string;
}

export const SortableFieldItem = ({
  active,
  disabled,
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
        draggable={draggable}
        gap="md"
        justify="space-between"
        mih={rem(40)}
        pos="relative"
        px="md"
        py={rem(12)}
        role="listitem"
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
