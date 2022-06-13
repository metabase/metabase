import React from "react";
import { t } from "ttag";
import { Item } from "metabase/collections/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { Bookmark, Collection } from "metabase-types/api";
import PinnedQuestionLoader from "./PinnedQuestionLoader";
import {
  CardActionMenu,
  CardRoot,
  CardPreviewSkeleton,
  CardStaticSkeleton,
} from "./PinnedQuestionCard.styled";

export interface PinnedQuestionCardProps {
  item: Item;
  collection: Collection;
  metadata: Metadata;
  bookmarks?: Bookmark[];
  isPreview?: boolean;
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
  isPreview,
  onCopy,
  onMove,
  onCreateBookmark,
  onDeleteBookmark,
}: PinnedQuestionCardProps): JSX.Element => {
  return (
    <CardRoot to={item.getUrl()} isPreview={isPreview}>
      <CardActionMenu
        item={item}
        collection={collection}
        bookmarks={bookmarks}
        onCopy={onCopy}
        onMove={onMove}
        createBookmark={onCreateBookmark}
        deleteBookmark={onDeleteBookmark}
      />
      {isPreview ? (
        <PinnedQuestionLoader id={item.id} metadata={metadata}>
          {({ question, rawSeries, loading, error, errorIcon }) =>
            loading ? (
              <CardPreviewSkeleton
                name={question?.displayName()}
                display={question?.display()}
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
      ) : (
        <CardStaticSkeleton
          name={item.name}
          description={item.description ?? t`A question`}
          icon={item.getIcon()}
        />
      )}
    </CardRoot>
  );
};

export default PinnedQuestionCard;
