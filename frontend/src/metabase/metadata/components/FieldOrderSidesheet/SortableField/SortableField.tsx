import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";

import { Sortable } from "metabase/core/components/Sortable";
import { Flex, Group, Icon, type IconName, Text } from "metabase/ui";

import S from "./SortableField.module.css";

interface Props {
  disabled?: boolean;
  icon: IconName;
  id: UniqueIdentifier;
  label: string;
}

export const SortableField = ({ disabled, icon, id, label }: Props) => {
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
          [S.draggable]: draggable,
        })}
        draggable={draggable}
        gap="md"
        mih={40}
        pos="relative"
        px="sm"
        py="xs"
        role="listitem"
        w="100%"
      >
        <Group flex="0 0 auto" gap="sm" ml="xs" wrap="nowrap">
          {draggable && <Icon className={S.grabber} name="grabber" />}

          <Icon name={icon} />
        </Group>

        <Text className={S.label} flex="1" fw="bold" lh="normal" mr="xs">
          {label}
        </Text>
      </Flex>
    </Sortable>
  );
};
