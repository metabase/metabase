import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useState } from "react";
import { t } from "ttag";

import ActionMenu from "metabase/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { EventSandbox } from "metabase/common/components/EventSandbox";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Tooltip } from "metabase/ui";
import { Flex, type IconName, Skeleton } from "metabase/ui";
import { modelToUrl } from "metabase/utils/urls";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  RecentCollectionItem,
} from "metabase-types/api";

import {
  ActionsContainer,
  Body,
  Description,
  Header,
  ItemCard,
  ItemLink,
  Title,
} from "./PinnedItemCard.styled";

type ItemOrSkeleton =
  | {
      /** If `item` is undefined, the `skeleton` prop must be true */
      item: CollectionItem | RecentCollectionItem;
      skeleton?: never;
      iconForSkeleton?: never;
    }
  | {
      item?: never;
      skeleton: true;
      iconForSkeleton: IconName;
    };

export type PinnedItemCardProps = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  className?: string;
  collection?: Collection;
  onCopy?: (items: CollectionItem[]) => void;
  onMove?: (items: CollectionItem[]) => void;
  onClick?: () => void;
} & ItemOrSkeleton;

const TOOLTIP_MAX_WIDTH = 450;

const DEFAULT_DESCRIPTION: Record<string, string> = {
  get card() {
    return t`A question`;
  },
  get metric() {
    return t`A metric`;
  },
  get dashboard() {
    return t`A dashboard`;
  },
  get dataset() {
    return t`A model`;
  },
};

const isCollectionItem = (
  item: CollectionItem | RecentCollectionItem,
): item is CollectionItem => {
  return !("parent_collection" in item);
};

function PinnedItemCard({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  className,
  item,
  collection,
  onCopy,
  onMove,
  onClick,
  iconForSkeleton,
}: PinnedItemCardProps) {
  const getIcon = useGetIcon();
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const iconData = iconForSkeleton
    ? { name: iconForSkeleton }
    : getIcon({
        model: item.model,
        display: item.display,
        moderated_status: item.moderated_status,
      });

  const maybeEnableTooltip = (
    event: MouseEvent<HTMLDivElement>,
    setterFn: Dispatch<SetStateAction<boolean>>,
  ) => {
    const target = event.target as HTMLDivElement;
    const isTargetElWiderThanCard = target?.scrollWidth > target?.clientWidth;
    if (isTargetElWiderThanCard) {
      setterFn(true);
    }
  };

  const hasActions =
    item &&
    isCollectionItem(item) &&
    (onCopy || onMove || createBookmark || deleteBookmark || collection);

  return (
    <ItemLink
      className={className}
      to={item ? (modelToUrl(item) ?? "/") : undefined}
      onClick={onClick}
    >
      <ItemCard flat>
        <Body>
          <Header>
            <EntityIcon {...iconData} size="1.5rem" color="brand" />
            <ActionsContainer h={item ? undefined : "2rem"}>
              {hasActions && (
                // This component is used within a `<Link>` component,
                // so we must prevent events from triggering the activation of the link
                <EventSandbox preventDefault sandboxedEvents={["onClick"]}>
                  <ActionMenu
                    databases={databases}
                    bookmarks={bookmarks}
                    createBookmark={createBookmark}
                    deleteBookmark={deleteBookmark}
                    item={item}
                    collection={collection}
                    onCopy={onCopy}
                    onMove={onMove}
                  />
                </EventSandbox>
              )}
            </ActionsContainer>
          </Header>
          {item ? (
            <>
              <Tooltip
                label={item.name}
                position="bottom"
                disabled={!showTitleTooltip}
                maw={TOOLTIP_MAX_WIDTH}
              >
                <Title
                  onMouseEnter={(e) =>
                    maybeEnableTooltip(e, setShowTitleTooltip)
                  }
                >
                  <Flex align="center" gap="0.5rem">
                    {item.name}
                    <PLUGIN_MODERATION.ModerationStatusIcon
                      status={item.moderated_status}
                      filled
                      size={14}
                    />
                  </Flex>
                </Title>
              </Tooltip>
              <Description tooltipMaxWidth={TOOLTIP_MAX_WIDTH}>
                {item.description || DEFAULT_DESCRIPTION[item.model] || ""}
              </Description>
            </>
          ) : (
            <>
              <Skeleton natural h="1.5rem" />
              <Skeleton natural mt="xs" mb="4px" h="1rem" />
            </>
          )}
        </Body>
      </ItemCard>
    </ItemLink>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedItemCard;
