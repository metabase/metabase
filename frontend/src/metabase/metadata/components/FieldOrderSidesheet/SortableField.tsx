import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import Grabber from "metabase/components/Grabber";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { Box, Flex, Group, Icon, Text } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";

interface Props {
  field: Field;
  id: UniqueIdentifier;
}

export const SortableField = ({ field, id }: Props) => {
  const {
    attributes,
    isDragging,
    listeners,
    transform,
    transition,
    setNodeRef,
  } = useSortable({ id });

  const dragHandle = (
    <Grabber style={{ width: 10 }} {...attributes} {...listeners} />
  );

  const icon = null; // TODO

  return (
    <Box
      pos="relative"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
      }}
    >
      <Flex
        bg="bg-white"
        c="text-medium"
        px="sm"
        py="xs"
        w="100%"
        /* className={cx(
          CS.overflowHidden,
          CS.bordered,
          CS.rounded,
          ColumnItemS.ColumnItemRoot,
          {
            [cx(ColumnItemS.Draggable, CS.cursorGrab)]: draggable,
          },
          className,
        )} */
        // role={role}
        // onClick={onClick}
        // aria-label={role ? title : undefined}
        // data-testid={draggable ? `draggable-item-${title}` : null}
        // data-enabled={!!onRemove}
      >
        <Group gap="xs" p="xs" wrap="nowrap">
          <Icon
            // className={cx(CS.flexNoShrink, ColumnItemS.ColumnItemDragHandle)}
            name="grabber"
          />
        </Group>
        <Group /* className={CS.flex1} */ px="xs" wrap="nowrap">
          {icon && <Icon name={icon} /* className={CS.flexNoShrink} */ />}
          <Text fw="bold" lh="normal" /* className={CS.textWrap} */>
            {field.name || NULL_DISPLAY_VALUE}
          </Text>
        </Group>
      </Flex>
    </Box>
  );
};
