import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";
import { Link } from "react-router";

import { Sortable } from "metabase/core/components/Sortable";
import { Flex, Group, Icon, type IconName, Text } from "metabase/ui";

import S from "./SortableField.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  href?: string;
  icon: IconName;
  id: UniqueIdentifier;
  label: string;
}

export const SortableField = ({
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
        c="text-medium"
        className={cx(S.content, {
          [S.active]: active,
          [S.draggable]: draggable,
        })}
        component={href ? Link : undefined}
        draggable={draggable}
        gap="md"
        mih={40}
        pos="relative"
        px="sm"
        py="xs"
        role="listitem"
        bg="bg-white"
        // "to" prop should be undefined when Link component is not used.
        // Types do not account for conditional Link usage, hence cast.
        to={href ? href : (undefined as unknown as string)}
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
