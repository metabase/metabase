import { t } from "ttag";
import _ from "underscore";

import PinDropZone from "metabase/collections/components/PinDropZone";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import PinnedItemSortDropTarget from "metabase/collections/components/PinnedItemSortDropTarget";
import PinnedQuestionCard from "metabase/collections/components/PinnedQuestionCard";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { isPreviewShown, isRootCollection } from "metabase/collections/utils";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import CS from "metabase/css/core/index.css";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import {
  Container,
  Grid,
  SectionHeader,
  SectionSubHeader,
} from "./PinnedItemOverview.styled";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
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
                <div key={item.id} className={CS.relative}>
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
              <div key={item.id} className={CS.relative}>
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
              <div key={item.id} className={CS.relative}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedItemOverview;
