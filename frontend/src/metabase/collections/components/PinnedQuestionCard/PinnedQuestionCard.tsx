import React from "react";
import { Item } from "metabase/collections/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { Bookmark, Collection } from "metabase-types/api";
import PinnedQuestionLoader from "./PinnedQuestionLoader";
import {
  CardActionMenu,
  CardRoot,
  CardSkeleton,
} from "./PinnedQuestionCard.styled";

export interface PinnedQuestionCardProps {
  item: Item;
  collection: Collection;
  metadata: Metadata;
  bookmarks?: Bookmark[];
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
  onCreateBookmark?: (id: string, model: string) => void;
  onDeleteBookmark?: (id: string, model: string) => void;
}

const PinnedQuestionCard = ({
  item,
  collection,
  metadata,
  bookmarks,
  onCopy,
  onMove,
  onCreateBookmark,
  onDeleteBookmark,
}: PinnedQuestionCardProps): JSX.Element => {
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
      <PinnedQuestionLoader id={item.id} metadata={metadata}>
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
      </PinnedQuestionLoader>
    </CardRoot>
  );
};

export default PinnedQuestionCard;
