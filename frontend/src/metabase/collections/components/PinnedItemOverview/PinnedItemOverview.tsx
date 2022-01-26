import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import CollectionCardVisualization from "metabase/collections/components/CollectionCardVisualization";
import EmptyPinnedItemsBanner from "../EmptyPinnedItemsBanner/EmptyPinnedItemsBanner";
import { Item, Collection, isRootCollection } from "metabase/collections/utils";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import { color } from "metabase/lib/colors";

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
  const questionAndDashboardItems = _.sortBy(
    items.filter(item => item.model !== "dataset"),
    item => item.collection_position,
  );
  const dataModelItems = _.sortBy(
    items.filter(item => item.model === "dataset"),
    item => item.collection_position,
  );

  return items.length === 0 ? (
    <Container>
      <EmptyPinnedItemsBanner />
    </Container>
  ) : (
    <Container data-testid="pinned-items">
      {questionAndDashboardItems.length > 0 && (
        <Grid>
          {questionAndDashboardItems.map(item => (
            <PinDropTarget key={item.id} pinIndex={item.collection_position}>
              {({ hovered }: { hovered: boolean }) => {
                return (
                  <ItemDragSource
                    key={item.id}
                    item={item}
                    collection={collection}
                  >
                    <div
                      style={{
                        outline: hovered
                          ? `1px solid ${color("brand")}`
                          : undefined,
                      }}
                    >
                      {item.model === "card" ? (
                        <CollectionCardVisualization
                          item={item}
                          collection={collection}
                          metadata={metadata}
                          onCopy={onCopy}
                          onMove={onMove}
                        />
                      ) : (
                        <PinnedItemCard
                          item={item}
                          collection={collection}
                          onCopy={onCopy}
                          onMove={onMove}
                        />
                      )}
                    </div>
                  </ItemDragSource>
                );
              }}
            </PinDropTarget>
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
              <PinDropTarget key={item.id} pinIndex={item.collection_position}>
                {({
                  hovered,
                  highlighted,
                }: {
                  hovered: boolean;
                  highlighted: boolean;
                }) => {
                  return (
                    <ItemDragSource item={item} collection={collection}>
                      <div
                        style={{
                          outline: hovered
                            ? `5px solid ${color("brand-light")}`
                            : highlighted
                            ? `5px solid ${color("bg-medium")}`
                            : undefined,
                        }}
                      >
                        <PinnedItemCard
                          item={item}
                          collection={collection}
                          onCopy={onCopy}
                          onMove={onMove}
                        />
                      </div>
                    </ItemDragSource>
                  );
                }}
              </PinDropTarget>
            ))}
          </Grid>
        </div>
      )}
    </Container>
  );
}

export default PinnedItemOverview;
