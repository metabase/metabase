import { PointerSensor, useSensor } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Sortable, SortableList } from "metabase/common/components/Sortable";
import { ActionIcon, Box, Card, Group, Icon } from "metabase/ui";

type GroupMemberListProps<T> = {
  /** In order */
  items: T[];
  getId: (item: T) => number;
  /** For the remove button's label */
  getName: (item: T) => string;
  /** The row's middle: a name, or an input for the member's label */
  renderContent: (item: T) => ReactNode;
  /** Column headings over the rows' middles, laid out like `renderContent` */
  header?: ReactNode;
  onReorder: (items: T[]) => void;
  onRemove: (item: T) => void;
};

/**
 * A segment or measure group's members, dragged into order by the handle on
 * each row's left. Only the handle drags, so inputs in a row stay usable.
 */
export function GroupMemberList<T>({
  items,
  getId,
  getName,
  renderContent,
  header,
  onReorder,
  onRemove,
}: GroupMemberListProps<T>) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });

  return (
    <Box role="list" aria-label={t`Members in order`}>
      {header != null && (
        // The rows' layout with the handle and remove button held as space,
        // so the headings sit over their columns
        <Group gap="sm" wrap="nowrap" px="sm" pb="xs" aria-hidden>
          <Box display="flex" style={{ visibility: "hidden" }}>
            <Icon name="grabber" />
          </Box>
          <Box flex={1} miw={0}>
            {header}
          </Box>
          <ActionIcon tabIndex={-1} style={{ visibility: "hidden" }}>
            <Icon name="close" />
          </ActionIcon>
        </Group>
      )}
      <SortableList<T>
        items={items}
        getId={getId}
        sensors={[pointerSensor]}
        // An overlay renders outside the modal; drag the row in place instead
        useDragOverlay={false}
        renderItem={({ item }) => (
          <Sortable
            key={getId(item)}
            id={getId(item)}
            role="listitem"
            draggingStyle={{ opacity: 0.5 }}
          >
            {({ dragHandleRef, dragHandleListeners }) => (
              <Card
                bg="background_page-secondary"
                shadow="none"
                radius="md"
                px="sm"
                py="xs"
                mb="xs"
              >
                <Group gap="sm" wrap="nowrap">
                  <Box
                    component="span"
                    ref={dragHandleRef}
                    aria-label={t`Drag to reorder`}
                    display="flex"
                    style={{ cursor: "grab" }}
                    {...dragHandleListeners}
                  >
                    <Icon name="grabber" c="text-secondary" />
                  </Box>
                  <Box flex={1} miw={0}>
                    {renderContent(item)}
                  </Box>
                  <ActionIcon
                    aria-label={t`Remove ${getName(item)}`}
                    onClick={() => onRemove(item)}
                  >
                    <Icon name="close" />
                  </ActionIcon>
                </Group>
              </Card>
            )}
          </Sortable>
        )}
        onSortEnd={({ itemIds }) =>
          onReorder(
            itemIds.flatMap((id) => {
              const item = items.find((known) => getId(known) === id);
              return item ? [item] : [];
            }),
          )
        }
      />
    </Box>
  );
}
