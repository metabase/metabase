import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/dnd/constants";
import {
  removeCard,
  selectCards,
  selectDatasets,
  selectExpandedCards,
  selectSelectedCardId,
  setSelectedCard,
  toggleCardExpanded,
} from "metabase/visualizer/visualizer.slice";

import { ColumnListItem, type ColumnListItemProps } from "./ColumnListItem";
import S from "./DatasetList.module.css";

export const DatasetList = () => {
  const cards = useSelector(selectCards);
  const datasets = useSelector(selectDatasets);
  const expandedCards = useSelector(selectExpandedCards);
  const selectedCardId = useSelector(selectSelectedCardId);
  const dispatch = useDispatch();

  return (
    <Flex
      px={12}
      direction="column"
      style={{
        overflowY: "auto",
      }}
    >
      {cards.map(card => {
        const dataset = datasets[card.id];
        const isExpanded = expandedCards[card.id];
        const isSelected = selectedCardId === card.id;

        return (
          <Box key={card.id} mb={4}>
            <Flex
              align="center"
              px={8}
              py={4}
              bg={isSelected ? "var(--mb-color-bg-light)" : undefined}
              onClick={() => dispatch(setSelectedCard(card.id))}
              className={S.parent}
            >
              <Icon
                style={{ flexShrink: 0 }}
                name={isExpanded ? "chevronup" : "chevrondown"}
                aria-label={t`Expand`}
                size={12}
                mr={6}
                onClick={() => dispatch(toggleCardExpanded(card.id))}
                cursor="pointer"
              />
              <Text truncate mr={4}>
                {card.name}
              </Text>
              <Icon
                style={{ flexShrink: 0 }}
                className={S.close}
                name="close"
                ml="auto"
                size={12}
                aria-label={t`Remove the dataset ${card.name} from the list`}
                onClick={() => dispatch(removeCard(card.id))}
                cursor="pointer"
              />
            </Flex>
            {isExpanded && dataset && dataset.data.cols && (
              <Box ml={12} mt={2}>
                {dataset.data.cols.map(column => (
                  <DraggableColumnListItem key={column.name} column={column} />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Flex>
  );
};

function DraggableColumnListItem({ column, ...props }: ColumnListItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: column.name,
    data: {
      type: DRAGGABLE_ID.COLUMN,
      column,
    },
  });

  return (
    <ColumnListItem
      {...props}
      {...attributes}
      {...listeners}
      column={column}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      ref={setNodeRef}
    />
  );
}
