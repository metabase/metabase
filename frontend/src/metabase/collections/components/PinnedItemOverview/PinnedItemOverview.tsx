import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import CollectionCardVisualization from "metabase/collections/components/CollectionCardVisualization";
import EmptyPinnedItemsBanner from "../EmptyPinnedItemsBanner/EmptyPinnedItemsBanner";
import { Item, Collection, isRootCollection } from "metabase/collections/utils";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import { color } from "metabase/lib/colors";

import {
  Container,
  Grid,
  SectionHeader,
  FullHeightPinDropTarget,
} from "./PinnedItemOverview.styled";

type PinDropTargetRenderOptions = {
  isBackTarget?: boolean;
  isFrontTarget?: boolean;
  itemModel: string;
  pinIndex?: number | null;
  enableDropTargetBackground?: boolean;
  hovered: boolean;
  highlighted: boolean;
};

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
  const sortedItems = _.sortBy(items, item => item.collection_position);
  const {
    card: cardItems = [],
    dashboard: dashboardItems = [],
    dataset: dataModelItems = [],
  } = _.groupBy(sortedItems, "model");

  return items.length === 0 ? (
    <Container>
      <EmptyPinnedItemsBanner />
    </Container>
  ) : (
    <Container data-testid="pinned-items">
      {cardItems.length > 0 && (
        <Grid>
          {cardItems.map(item => (
            <div key={item.id} style={{ position: "relative" }}>
              <FullHeightPinDropTarget
                isFrontTarget
                itemModel="card"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              >
                {(options: PinDropTargetRenderOptions) => {
                  return <div style={getPinDropStyle(options)} />;
                }}
              </FullHeightPinDropTarget>
              <ItemDragSource item={item} collection={collection}>
                <div>
                  <CollectionCardVisualization
                    item={item}
                    collection={collection}
                    metadata={metadata}
                    onCopy={onCopy}
                    onMove={onMove}
                  />
                </div>
              </ItemDragSource>
              <FullHeightPinDropTarget
                isBackTarget
                itemModel="card"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              >
                {(options: PinDropTargetRenderOptions) => {
                  return <div style={getPinDropStyle(options)} />;
                }}
              </FullHeightPinDropTarget>
            </div>
          ))}
        </Grid>
      )}

      {dashboardItems.length > 0 && (
        <Grid>
          {dashboardItems.map(item => (
            <div key={item.id} style={{ position: "relative" }}>
              <FullHeightPinDropTarget
                isFrontTarget
                itemModel="dashboard"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              >
                {(options: PinDropTargetRenderOptions) => {
                  return <div style={getPinDropStyle(options)} />;
                }}
              </FullHeightPinDropTarget>
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
              <FullHeightPinDropTarget
                isBackTarget
                itemModel="dashboard"
                pinIndex={item.collection_position}
                enableDropTargetBackground={false}
              >
                {(options: PinDropTargetRenderOptions) => {
                  return <div style={getPinDropStyle(options)} />;
                }}
              </FullHeightPinDropTarget>
            </div>
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
              <div key={item.id} style={{ position: "relative" }}>
                <FullHeightPinDropTarget
                  isFrontTarget
                  itemModel="dataset"
                  pinIndex={item.collection_position}
                  enableDropTargetBackground={false}
                >
                  {(options: PinDropTargetRenderOptions) => {
                    return <div style={getPinDropStyle(options)} />;
                  }}
                </FullHeightPinDropTarget>
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
                <FullHeightPinDropTarget
                  isBackTarget
                  itemModel="dataset"
                  pinIndex={item.collection_position}
                  enableDropTargetBackground={false}
                >
                  {(options: PinDropTargetRenderOptions) => {
                    return <div style={getPinDropStyle(options)} />;
                  }}
                </FullHeightPinDropTarget>
              </div>
            ))}
          </Grid>
        </div>
      )}
    </Container>
  );
}

export default PinnedItemOverview;

function getPinDropStyle({
  hovered,
  highlighted,
  isFrontTarget,
  isBackTarget,
}: PinDropTargetRenderOptions): React.CSSProperties | undefined {
  if (hovered) {
    return {
      zIndex: 1,
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      borderLeft: isFrontTarget ? `4px solid ${color("brand")}` : undefined,
      borderRight: isBackTarget ? `4px solid ${color("brand")}` : undefined,
    };
  } else if (highlighted) {
    return {
      zIndex: 1,
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      borderLeft: isFrontTarget ? `4px solid ${color("bg-medium")}` : undefined,
      borderRight: isBackTarget ? `4px solid ${color("bg-medium")}` : undefined,
    };
  } else {
    return {
      display: "none",
    };
  }
}
