import React from "react";
import _ from "underscore";
import { t } from "ttag";

import { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import PinnedQuestionCard from "metabase/collections/components/PinnedQuestionCard";
import PinnedItemSortDropTarget from "metabase/collections/components/PinnedItemSortDropTarget";
import { isPreviewShown, isRootCollection } from "metabase/collections/utils";
import PinDropZone from "metabase/collections/components/PinDropZone";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import Database from "metabase-lib/metadata/Database";

import {
  Container,
  Grid,
  SectionHeader,
  SectionSubHeader,
} from "./PinnedItemOverview.styled";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: (id: string, collection: string) => void;
  deleteBookmark: (id: string, collection: string) => void;
  items: CollectionItem[];
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
};

function PinnedItemOverview({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  items,
  collection,
  onCopy,
  onMove,
}: Props) {
  const sortedItems = _.sortBy(items, item => item.collection_position);
  const {
    card: cardItems = [],
    dashboard: dashboardItems = [],
    dataset: dataModelItems = [],
  } = _.groupBy(sortedItems, "model");
  const cardGroups = _.partition(cardItems, isPreviewShown);

  return items.length === 0 ? (
    <Container>
      <PinDropZone variant="pin" empty />
    </Container>
  ) : (
    <Container data-testid="pinned-items">
      <PinDropZone variant="pin" />
      {cardGroups.map(
        (cardGroup, cardGroupIndex) =>
          cardGroup.length > 0 && (
            <Grid key={cardGroupIndex}>
              {cardGroup.map(item => (
                <div key={item.id} className="relative">
                  <PinnedItemSortDropTarget
                    isFrontTarget
                    itemModel="card"
                    pinIndex={item.collection_position}
                    enableDropTargetBackground={false}
                  />
                  <ItemDragSource item={item} collection={collection}>
                    <div>
                      <PinnedQuestionCard
                        item={item}
                        collection={collection}
                        databases={databases}
                        bookmarks={bookmarks}
                        onCopy={onCopy}
                        onMove={onMove}
                        onCreateBookmark={createBookmark}
                        onDeleteBookmark={deleteBookmark}
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
          ),
      )}

      {dashboardItems.length > 0 && (
        <div>
          <SectionHeader hasTopMargin={cardItems.length > 0}>
            <h3>{t`Dashboards`}</h3>
          </SectionHeader>
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
                      databases={databases}
                      bookmarks={bookmarks}
                      createBookmark={createBookmark}
                      deleteBookmark={deleteBookmark}
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
        </div>
      )}

      {dataModelItems.length > 0 && (
        <div>
          <SectionHeader
            hasTopMargin={cardItems.length > 0 || dashboardItems.length > 0}
          >
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
                      databases={databases}
                      bookmarks={bookmarks}
                      createBookmark={createBookmark}
                      deleteBookmark={deleteBookmark}
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
