import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import CollectionCardVisualization from "metabase/collections/components/CollectionCardVisualization";
import { Item, Collection, isRootCollection } from "metabase/collections/utils";

import { Container, Grid, SectionHeader } from "./PinnedItemOverview.styled";

type Props = {
  items: Item[];
  collection: Collection;
  metadata: Metadata;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

function PinnedItemOverview({
  items,
  collection,
  metadata,
  onCopy,
  onMove,
}: Props) {
  const sortedItems = _.sortBy(items, item => item.name);
  const {
    card: cardItems = [],
    dashboard: dashboardItems = [],
    dataset: dataModelItems = [],
  } = _.groupBy(sortedItems, "model");

  return items.length ? (
    <Container data-testid="pinned-items">
      {cardItems.length > 0 && (
        <Grid>
          {cardItems.map(item => (
            <CollectionCardVisualization
              key={item.id}
              item={item}
              collection={collection}
              metadata={metadata}
              onCopy={onCopy}
              onMove={onMove}
            />
          ))}
        </Grid>
      )}
      {dashboardItems.length > 0 && (
        <Grid>
          {dashboardItems.map(item => (
            <PinnedItemCard
              key={item.id}
              item={item}
              collection={collection}
              onCopy={onCopy}
              onMove={onMove}
            />
          ))}
        </Grid>
      )}
      {dataModelItems.length > 0 && (
        <div>
          <SectionHeader>
            <h4>{t`Useful data`}</h4>
            <div>
              {isRootCollection(collection)
                ? t`Start new explorations here`
                : t`Start new explorations about ${collection.name} here`}
            </div>
          </SectionHeader>
          <Grid>
            {dataModelItems.map(item => (
              <PinnedItemCard
                key={item.id}
                item={item}
                collection={collection}
                onCopy={onCopy}
                onMove={onMove}
              />
            ))}
          </Grid>
        </div>
      )}
    </Container>
  ) : null;
}

export default PinnedItemOverview;
