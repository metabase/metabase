import cx from "classnames";
import { t } from "ttag";

import ActionMenu from "metabase/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import {
  isFullyParameterized,
  isPreviewShown,
} from "metabase/collections/utils";
import EventSandbox from "metabase/components/EventSandbox";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import {
  CardActionMenuContainer,
  CardPreviewSkeleton,
  CardRoot,
  CardStaticSkeleton,
} from "./PinnedQuestionCard.styled";
import PinnedQuestionLoader from "./PinnedQuestionLoader";

export interface PinnedQuestionCardProps {
  item: CollectionItem;
  collection: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
  onCreateBookmark?: CreateBookmark;
  onDeleteBookmark?: DeleteBookmark;
}

const PinnedQuestionCard = ({
  item,
  collection,
  databases,
  bookmarks,
  onCopy,
  onMove,
  onCreateBookmark,
  onDeleteBookmark,
}: PinnedQuestionCardProps): JSX.Element => {
  const isPreview = isPreviewShown(item);

  const actionMenu = (
    // This component is used within a `<Link>` component,
    // so we must prevent events from triggering the activation of the link
    <EventSandbox preventDefault sandboxedEvents={["onClick"]}>
      <ActionMenu
        item={item}
        collection={collection}
        databases={databases}
        bookmarks={bookmarks}
        onCopy={onCopy}
        onMove={onMove}
        createBookmark={onCreateBookmark}
        deleteBookmark={onDeleteBookmark}
      />
    </EventSandbox>
  );

  const positionedActionMenu = (
    <CardActionMenuContainer>{actionMenu}</CardActionMenuContainer>
  );

  return (
    <CardRoot
      to={item.getUrl()}
      isPreview={isPreview}
      className={cx(CS.hoverParent, CS.hoverVisibility)}
    >
      {!isPreview && positionedActionMenu}
      {isPreview ? (
        <PinnedQuestionLoader id={item.id}>
          {({ question, rawSeries, loading, error, errorIcon }) =>
            loading ? (
              <CardPreviewSkeleton
                name={question?.displayName()}
                display={question?.display()}
                description={question?.description()}
                actionMenu={actionMenu}
              />
            ) : (
              <Visualization
                actionButtons={actionMenu}
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
          icon={item.getIcon() as unknown as { name: IconName }}
          tooltip={getSkeletonTooltip(item)}
        />
      )}
    </CardRoot>
  );
};

const getSkeletonTooltip = (item: CollectionItem) => {
  if (!isFullyParameterized(item)) {
    return t`Open this question and fill in its variables to see it.`;
  } else {
    return undefined;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedQuestionCard;
