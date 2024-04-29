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
import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";
import { Text, Group, Icon, Stack } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import { Container, Grid, SectionContainer } from "./PinnedItemOverview.styled";

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
    dataset: modelItems = [],
    metric: metricItems = [],
  } = _.groupBy(sortedItems, "model");
  const cardGroups = _.partition(cardItems, isPreviewShown);
  const metricGroups = _.partition(metricItems, isPreviewShown);

  return items.length === 0 ? (
    <Container>
      <PinDropZone variant="pin" empty />
    </Container>
  ) : (
    <Container data-testid="pinned-items">
      <PinDropZone variant="pin" />

      {metricItems.length > 0 && (
        <SectionContainer>
          <SectionTitle title={t`Metrics`} icon="metric" />
          {metricGroups.map(
            (cardGroup, cardGroupIndex) =>
              cardGroup.length > 0 && (
                <Grid key={cardGroupIndex}>
                  {cardGroup.map(item => (
                    <div key={item.id} className={CS.relative}>
                      <PinnedItemSortDropTarget
                        isFrontTarget
                        itemModel="metric"
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
                        itemModel="metric"
                        pinIndex={item.collection_position}
                        enableDropTargetBackground={false}
                      />
                    </div>
                  ))}
                </Grid>
              ),
          )}
        </SectionContainer>
      )}

      {cardItems.length > 0 && (
        <SectionContainer>
          <SectionTitle title={t`Pinned questions`} icon="pin" />
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
        </SectionContainer>
      )}

      {dashboardItems.length > 0 && (
        <SectionContainer>
          <SectionTitle title={t`Dashboards`} icon="dashboard" />
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
        </SectionContainer>
      )}

      {modelItems.length > 0 && (
        <SectionContainer>
          <SectionTitle
            title={t`Useful data`}
            description={
              isRootCollection(collection)
                ? t`Start new explorations here`
                : t`Start new explorations about ${collection.name} here`
            }
          />
          <Grid>
            {modelItems.map(item => (
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
        </SectionContainer>
      )}
    </Container>
  );
}

interface SectionTitleProps {
  title: string;
  description?: string;
  icon?: IconName;
}

function SectionTitle({ title, description, icon }: SectionTitleProps) {
  return (
    <Stack spacing="sm" pb="md">
      <Group spacing="sm">
        {icon && <Icon name={icon} color={color("brand")} />}
        <h3>{title}</h3>
      </Group>
      {description && <Text color="text-medium">{description}</Text>}
    </Stack>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedItemOverview;
