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
import EventSandbox from "metabase/common/components/EventSandbox";
import CS from "metabase/css/core/index.css";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Text } from "metabase/ui";
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

  const DEFAULT_DESCRIPTION: Record<string, string> = {
    card: t`A question`,
    metric: t`A metric`,
  };

  return (
    <CardRoot
      to={modelToUrl(item)}
      isPreview={isPreview}
      className={cx(CS.hoverChild, CS.hoverVisibility)}
    >
      <Flex h="100%" direction="column">
        {isPreview ? (
          <Group justify="space-between" py="0.5rem" px="1rem">
            <Group gap="0.5rem">
              <Text fw="bold">{item.name}</Text>
              <PLUGIN_MODERATION.ModerationStatusIcon
                status={item.moderated_status}
                filled
              />
            </Group>
            <Group>
              {item.description && isPreview && (
                <Icon
                  className={cx(CS.hoverChild, CS.hoverChildSmooth)}
                  name="info"
                  c="text-tertiary"
                  tooltip={item.description}
                />
              )}
              {actionMenu}
            </Group>
          </Group>
        ) : (
          positionedActionMenu
        )}
        <Box flex="1 0 0">
          {isPreview ? (
            <PinnedQuestionLoader id={item.id}>
              {({ question, rawSeries, loading, error, errorIcon }) =>
                loading ? (
                  <CardPreviewSkeleton
                    display={question?.display()}
                    description={question?.description()}
                  />
                ) : (
                  <Visualization
                    rawSeries={rawSeries}
                    error={error}
                    errorIcon={errorIcon}
                    isDashboard
                  />
                )
              }
            </PinnedQuestionLoader>
          ) : (
            <CardStaticSkeleton
              name={item.name}
              nameRightSection={
                <PLUGIN_MODERATION.ModerationStatusIcon
                  status={item.moderated_status}
                  filled
                />
              }
              description={
                item.description || DEFAULT_DESCRIPTION[item.model] || ""
              }
              icon={getIcon(item)}
              tooltip={getSkeletonTooltip(item)}
            />
          )}
        </Box>
      </Flex>
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
