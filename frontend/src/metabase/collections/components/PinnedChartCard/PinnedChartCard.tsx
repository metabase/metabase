import React from "react";
import { Item } from "metabase/collections/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { Bookmark, Collection } from "metabase-types/api";
import PinnedChartLoader from "./PinnedChartLoader";
import {
  CardActionMenu,
  CardRoot,
  CardSkeleton,
} from "./PinnedChartCard.styled";

export interface PinnedChartCardProps {
  item: Item;
  collection: Collection;
  metadata: Metadata;
  bookmarks?: Bookmark[];
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
  onCreateBookmark?: (id: string, model: string) => void;
  onDeleteBookmark?: (id: string, model: string) => void;
}

const PinnedChartCard = ({
  item,
  collection,
  metadata,
  bookmarks,
  onCopy,
  onMove,
  onCreateBookmark,
  onDeleteBookmark,
}: PinnedChartCardProps): JSX.Element => {
  return (
    <CardRoot to={item.getUrl()}>
      <CardActionMenu
        item={item}
        collection={collection}
        bookmarks={bookmarks}
        onCopy={onCopy}
        onMove={onMove}
        createBookmark={onCreateBookmark}
        deleteBookmark={onDeleteBookmark}
      />
      <PinnedChartLoader id={item.id} metadata={metadata}>
        {({ question, rawSeries, loading, error, errorIcon }) =>
          loading ? (
            <CardSkeleton
              display={question?.display()}
              displayName={question?.displayName()}
              description={question?.description()}
            />
          ) : (
            <Visualization
              rawSeries={rawSeries}
              error={error}
              errorIcon={errorIcon}
              showTitle
              isDashboard
            />
          )
        }
      </PinnedChartLoader>
    </CardRoot>
  );
};

export default PinnedChartCard;
