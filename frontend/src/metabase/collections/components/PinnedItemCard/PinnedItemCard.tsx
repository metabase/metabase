import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useState } from "react";
import { t } from "ttag";

import ActionMenu from "metabase/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import Tooltip from "metabase/core/components/Tooltip";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import ModelDetailLink from "metabase/models/components/ModelDetailLink";
import { Skeleton, type IconName } from "metabase/ui";
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
  ItemIcon,
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

type Props = {
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
  card: t`A question`,
  dashboard: t`A dashboard`,
  dataset: t`A model`,
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
}: Props) {
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const icon =
    iconForSkeleton ??
    getIcon({
      model: item.model,
      moderated_status: item.moderated_status,
    }).name;

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
      to={item ? modelToUrl(item) ?? "/" : undefined}
      onClick={onClick}
    >
      <ItemCard flat>
        <Body>
          <Header>
            <ItemIcon name={icon as unknown as IconName} />
            <ActionsContainer h={item ? undefined : "2.5rem"}>
              {item?.model === "dataset" && <ModelDetailLink model={item} />}
              {hasActions && (
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
              )}
            </ActionsContainer>
          </Header>
          {item ? (
            <Tooltip
              tooltip={item.name}
              placement="bottom"
              maxWidth={TOOLTIP_MAX_WIDTH}
              isEnabled={showTitleTooltip}
            >
              <Title
                onMouseEnter={e => maybeEnableTooltip(e, setShowTitleTooltip)}
              >
                {item.name}
              </Title>
            </Tooltip>
          ) : (
            <Skeleton natural h="1.5rem" />
          )}
          {item ? (
            <Description tooltipMaxWidth={TOOLTIP_MAX_WIDTH}>
              {item.description || DEFAULT_DESCRIPTION[item.model] || ""}
            </Description>
          ) : (
            <Skeleton natural mt="xs" mb="4px" h="1rem" />
          )}
        </Body>
      </ItemCard>
    </ItemLink>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedItemCard;
