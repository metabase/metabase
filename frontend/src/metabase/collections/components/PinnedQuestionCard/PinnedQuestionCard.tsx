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
import { Box, CloseButton, type IconName } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  RecentItem,
} from "metabase-types/api";

import {
  CardActionMenuContainer,
  CardPreviewSkeleton,
  CardRoot,
  CardStaticSkeleton,
} from "./PinnedQuestionCard.styled";
import PinnedQuestionLoader from "./PinnedQuestionLoader";
import _ from "underscore";

export type PinnedQuestionCardProps = {
  item: CollectionItem;
  databases?: Database[];
  bookmarks?: Bookmark[];
  onCreateBookmark?: CreateBookmark;
  onDeleteBookmark?: DeleteBookmark;
  withBorder?: boolean;
  withCloseButton?: boolean;
} & ( // If there's no action menu, we can skip certain props
  | {
      withActionMenu: false;
      collection?: never;
      onCopy?: never;
      onMove?: never;
    }
  | {
      withActionMenu: true;
      collection: Collection;
      onCopy: (items: CollectionItem[]) => void;
      onMove: (items: CollectionItem[]) => void;
    }
) &
  (
    | { withCloseButton: true; onClose?: () => void }
    | { withCloseButton: false; onClose?: never }
  );

const PinnedQuestionCard = ({
  item,
  collection,
  databases,
  bookmarks,
  onCopy,
  onMove,
  onCreateBookmark,
  onDeleteBookmark,
  withActionMenu = true,
  withBorder = true,
  withCloseButton = false,
  onClose,
}: PinnedQuestionCardProps): JSX.Element => {
  const isPreview = isPreviewShown(item);

  const actionMenu = withActionMenu ? (
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
  ) : null;

  const positionedActionMenu = (
    <CardActionMenuContainer>{actionMenu}</CardActionMenuContainer>
  );

  const DEFAULT_DESCRIPTION: Record<string, string> = {
    card: t`A question`,
    metric: t`A metric`,
  };

  return (
    <CardRoot
      to={item.getUrl()}
      isPreview={isPreview}
      className={cx(CS.hoverParent, CS.hoverVisibility)}
      withBorder={withBorder}
    >
      {withCloseButton && (
        <EventSandbox preventDefault sandboxedEvents={["onClick"]}>
          <Box pos="absolute" right=".5rem" top=".5rem">
            <a
              onClick={e => {
                onClose?.();
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <CloseButton
                style={{
                  // HACK: Apply color correctly via Mantine
                  color: "#495057",
                }}
              />
            </a>
          </Box>
        </EventSandbox>
      )}
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
          description={
            item.description || DEFAULT_DESCRIPTION[item.model] || ""
          }
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
