import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";

import { Sortable } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { Box, Flex, Group, Icon, Text, isValidIconName } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";

import S from "./SortableField.module.css";

interface Props {
  disabled?: boolean;
  field: Field;
  id: UniqueIdentifier;
}

export const SortableField = ({ disabled, field, id }: Props) => {
  const { isDragging, transform, transition, setNodeRef } = useSortable({ id });
  const draggable = !disabled;
  const label = field.displayName() || NULL_DISPLAY_VALUE;
  const icon = field.icon();

  return (
    <Sortable disabled={disabled} id={id}>
      <Box
        draggable={draggable}
        pos="relative"
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 100 : 1,
        }}
      >
        <Flex
          align="center"
          aria-label={label}
          bg="bg-white"
          c="text-medium"
          className={cx(S.sortableField, {
            [S.draggable]: draggable,
            [S.dragging]: isDragging,
          })}
          gap="md"
          mih={40}
          px="sm"
          py="xs"
          role="listitem"
          w="100%"
        >
          <Group flex="0 0 auto" gap="sm" ml="xs" wrap="nowrap">
            {draggable && <Icon className={S.grabber} name="grabber" />}

            {isValidIconName(icon) && <Icon name={icon} />}
          </Group>

          <Text className={S.label} flex="1" fw="bold" lh="normal" mr="xs">
            {label}
          </Text>
        </Flex>
      </Box>
    </Sortable>
  );
};
