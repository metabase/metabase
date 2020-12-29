import React from "react";
import { Box, Flex } from "grid-styled";
import { assocIn } from "icepick";
import { t } from "ttag";

import VirtualizedList from "metabase/components/VirtualizedList";

import NormalItem from "metabase/collections/components/NormalItem";
import ItemTypeFilterBar, {
  FILTERS as ITEM_TYPE_FILTERS,
} from "metabase/collections/components/ItemTypeFilterBar";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import CollectionSectionHeading from "metabase/collections/components/CollectionSectionHeading";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
const ROW_HEIGHT = 72;
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import { color } from "metabase/lib/colors";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
export default function ItemList({
  items,
  collection,
  empty,
  selection,
  onToggleSelected,
  collectionHasPins,
  showFilters,
}) {
  const everythingName =
    collectionHasPins && items.length > 0 ? t`Everything else` : t`Everything`;
  const filters = assocIn(ITEM_TYPE_FILTERS, [0, "name"], everythingName);
  return (
    <Box className="relative">
      {showFilters ? (
        <ItemTypeFilterBar
          analyticsContext={ANALYTICS_CONTEXT}
          filters={filters}
        />
      ) : (
        collectionHasPins &&
        items.length > 0 && (
          <CollectionSectionHeading>{t`Everything else`}</CollectionSectionHeading>
        )
      )}
      {items.length > 0 && (
        <PinDropTarget pinIndex={null} margin={8}>
          <Box
            style={{
              position: "relative",
              height: ROW_HEIGHT * items.length,
            }}
          >
            <VirtualizedList
              items={items}
              rowHeight={ROW_HEIGHT}
              renderItem={({ item, index }) => (
                <Box className="relative">
                  <ItemDragSource
                    item={item}
                    selection={selection}
                    collection={collection}
                  >
                    <NormalItem
                      key={`${item.model}:${item.id}`}
                      item={item}
                      onPin={() => item.setPinned(true)}
                      collection={collection}
                      selection={selection}
                      onToggleSelected={onToggleSelected}
                      onMove={selectedItems =>
                        this.setState({
                          selectedItems,
                          selectedAction: "move",
                        })
                      }
                      onCopy={selectedItems =>
                        this.setState({
                          selectedItems,
                          selectedAction: "copy",
                        })
                      }
                    />
                  </ItemDragSource>
                </Box>
              )}
              // needed in order to prevent an issue with content not fully rendering
              // due to the collection content scrolling layout
              useAutoSizerHeight={true}
            />
          </Box>
        </PinDropTarget>
      )}
      {!collectionHasPins && !items.length > 0 && (
        <Box mt={"120px"}>
          <CollectionEmptyState />
        </Box>
      )}
      {empty && (
        <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
          {({ hovered }) => (
            <Flex
              align="center"
              justify="center"
              py={2}
              m={2}
              color={hovered ? color("brand") : color("text-medium")}
            >
              {t`Drag here to un-pin`}
            </Flex>
          )}
        </PinDropTarget>
      )}
    </Box>
  );
}
