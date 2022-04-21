import React from "react";
import _ from "underscore";
import { t } from "ttag";

import { BookmarksType, Collection } from "metabase-types/api";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import CollectionCardVisualization from "metabase/collections/components/CollectionCardVisualization";
import PinnedItemSortDropTarget from "metabase/collections/components/PinnedItemSortDropTarget";
import { Item, isRootCollection } from "metabase/collections/utils";
import PinDropZone from "metabase/collections/components/PinDropZone";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import {
  Container,
  Grid,
  SectionHeader,
  SectionSubHeader,
} from "./PinnedItemOverview.styled";

type Props = {
  bookmarks?: BookmarksType;
  createBookmark: (id: string, collection: string) => void;
  deleteBookmark: (id: string, collection: string) => void;
  items: Item[];
  collection: Collection;
  metadata: Metadata;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

function PinnedItemOverview({
  bookmarks,
  createBookmark,
  deleteBookmark,
  items,
  collection,
  metadata,
  onCopy,
  onMove,
}: Props) {
  const sortedItems = _.sortBy(items, item => item.collection_position);
  const {
    card: cardItems = [],
    dashboard: dashboardItems = [],
    dataset: dataModelItems = [],
  } = _.groupBy(sortedItems, "model");

  return items.length === 0 ? (
    <Container>
      <PinDropZone variant="pin" empty />
    </Container>
  ) : (
    <Container data-testid="pinned-items">
      <PinDropZone variant="pin" />
      {cardItems.length > 0 && (
        <Grid>
          {cardItems.map(item => (
            <div key={item.id} className="relative">
              <PinnedItemSortDropTarget
                isFrontTarget
                itemModel="card"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              />
              <ItemDragSource item={item} collection={collection}>
                <div>
                  <CollectionCardVisualization
                    bookmarks={bookmarks}
                    createBookmark={createBookmark}
                    deleteBookmark={deleteBookmark}
                    item={item}
                    collection={collection}
                    metadata={metadata}
                    onCopy={onCopy}
                    onMove={onMove}
                  />
                </div>
              </ItemDragSource>
              <PinnedItemSortDropTarget
                isBackTarget
                itemModel="card"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              />
            </div>
          ))}
        </Grid>
      )}

      {dashboardItems.length > 0 && (
        <Grid>
          {dashboardItems.map(item => (
            <div key={item.id} className="relative">
              <PinnedItemSortDropTarget
                isFrontTarget
                itemModel="dashboard"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              />
              <ItemDragSource item={item} collection={collection}>
                <div>
                  <PinnedItemCard
                    item={item}
                    collection={collection}
                    onCopy={onCopy}
                    onMove={onMove}
                  />
                </div>
              </ItemDragSource>
              <PinnedItemSortDropTarget
                isBackTarget
                itemModel="dashboard"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              />
            </div>
          ))}
        </Grid>
      )}

      {dataModelItems.length > 0 && (
        <div>
          <SectionHeader>
            <h3>{t`Useful data`}</h3>
            <SectionSubHeader>
              {isRootCollection(collection)
                ? t`Start new explorations here`
                : t`Start new explorations about ${collection.name} here`}
            </SectionSubHeader>
          </SectionHeader>
          <Grid>
            {dataModelItems.map(item => (
              <div key={item.id} className="relative">
                <PinnedItemSortDropTarget
                  isFrontTarget
                  itemModel="dataset"
                  pinIndex={item.collection_position}
                  enableDropTargetBackground={false}
                />
                <ItemDragSource item={item} collection={collection}>
                  <div>
                    <PinnedItemCard
                      item={item}
                      collection={collection}
                      onCopy={onCopy}
                      onMove={onMove}
                    />
                  </div>
                </ItemDragSource>
                <PinnedItemSortDropTarget
                  isBackTarget
                  itemModel="dataset"
                  pinIndex={item.collection_position}
                  enableDropTargetBackground={false}
                />
              </div>
            ))}
          </Grid>
        </div>
      )}
    </Container>
  );
}

export default PinnedItemOverview;
