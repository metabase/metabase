import cx from "classnames";
import { type FocusEvent, type MouseEvent, useState } from "react";
import { t } from "ttag";

import { ActionMenu } from "metabase/common/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnToggleSelectedWithItem,
} from "metabase/common/collections/types";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { EventSandbox } from "metabase/common/components/EventSandbox";
import { Link } from "metabase/common/components/Link";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Card, Checkbox, Ellipsified, Group } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  CollectionItemModel,
  Database,
  RecentCollectionItem,
} from "metabase-types/api";

import S from "./CompactPinnedItemCard.module.css";
import { SelectModeCardWrapper } from "./SelectModeCardWrapper";

const TOOLTIP_MAX_WIDTH = 450;

const DEFAULT_DESCRIPTION: Partial<Record<CollectionItemModel, string>> = {
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
  get document() {
    return t`A document`;
  },
};

export type CompactPinnedItemCardProps = {
  item: CollectionItem | RecentCollectionItem;
  collection?: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  onCopy?: (items: CollectionItem[]) => void;
  onMove?: (items: CollectionItem[]) => void;
  onClick?: () => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
  showSelectAffordance?: boolean;
};

const isCollectionItem = (
  item: CollectionItem | RecentCollectionItem,
): item is CollectionItem => {
  return !("parent_collection" in item);
};

export function CompactPinnedItemCard({
  item,
  collection,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  onCopy,
  onMove,
  onClick,
  isSelectMode,
  isSelected,
  onToggleSelected,
  showSelectAffordance,
}: CompactPinnedItemCardProps) {
  const getIcon = useGetIcon();
  const icon = getIcon({
    model: item.model,
    display: item.display,
    moderated_status: item.moderated_status,
  });
  const description = item.description || DEFAULT_DESCRIPTION[item.model] || "";
  const actionMenuItem = isCollectionItem(item) ? item : null;
  const hasActionHandlers = Boolean(
    onCopy || onMove || createBookmark || deleteBookmark || collection,
  );
  const toggleSelected =
    onToggleSelected && isCollectionItem(item)
      ? () => onToggleSelected(item)
      : undefined;
  const isInSelectMode = Boolean(isSelectMode) && toggleSelected != null;
  const showAsSelected = isInSelectMode && Boolean(isSelected);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState(false);
  const showCheckbox =
    toggleSelected != null &&
    (isInSelectMode || Boolean(showSelectAffordance)) &&
    (showAsSelected || isHoveredOrFocused);
  const highlightProps = toggleSelected
    ? {
        onMouseEnter: () => setIsHoveredOrFocused(true),
        onMouseLeave: () => setIsHoveredOrFocused(false),
        onFocus: (event: FocusEvent) => {
          if (event.target === event.currentTarget) {
            setIsHoveredOrFocused(true);
          }
        },
        onBlur: (event: FocusEvent) => {
          if (event.target === event.currentTarget) {
            setIsHoveredOrFocused(false);
          }
        },
      }
    : {};
  const handleLinkClick = (event: MouseEvent) => {
    if (event.shiftKey && toggleSelected) {
      event.preventDefault();
      document.getSelection()?.removeAllRanges();
      toggleSelected();
      return;
    }
    onClick?.();
  };

  const card = (
    <Card
      className={cx(S.card, {
        [S.selectable]: isInSelectMode || showSelectAffordance,
        [S.selected]: showAsSelected,
      })}
      data-testid="pinned-item-card"
      h="5rem"
      p={0}
      pos="relative"
      withBorder
    >
      <Box className={S.body}>
        {showCheckbox ? (
          <Checkbox
            aria-hidden
            checked={showAsSelected}
            className={S.selectCheckbox}
            data-testid="pinned-item-checkbox"
            readOnly
            style={{ pointerEvents: "none" }}
            tabIndex={-1}
          />
        ) : (
          <EntityIcon
            {...icon}
            className={S.icon}
            size="1.25rem"
            color="core-brand"
          />
        )}
        <Box className={S.content}>
          <Group className={S.titleRow} gap="sm" miw={0} wrap="nowrap">
            <Ellipsified
              fw="bold"
              fz="md"
              lh="1rem"
              tooltipProps={{ maw: TOOLTIP_MAX_WIDTH, position: "bottom" }}
            >
              {item.name}
            </Ellipsified>
            <PLUGIN_MODERATION.ModerationStatusIcon
              status={item.moderated_status}
              filled
              size={14}
            />
          </Group>
          <MarkdownPreview
            className={S.description}
            tooltipMaxWidth={TOOLTIP_MAX_WIDTH}
          >
            {description}
          </MarkdownPreview>
        </Box>
      </Box>
      {actionMenuItem && hasActionHandlers && (
        <Box className={S.actions}>
          {/* Used within a `<Link>`, so we must prevent events from triggering the link */}
          <EventSandbox preventDefault sandboxedEvents={["onClick"]}>
            <ActionMenu
              item={actionMenuItem}
              collection={collection}
              databases={databases}
              bookmarks={bookmarks}
              createBookmark={createBookmark}
              deleteBookmark={deleteBookmark}
              onCopy={onCopy}
              onMove={onMove}
              isSelected={showAsSelected}
              onToggleSelected={toggleSelected}
            />
          </EventSandbox>
        </Box>
      )}
    </Card>
  );

  if (isInSelectMode && toggleSelected) {
    return (
      <SelectModeCardWrapper
        name={item.name}
        isSelected={showAsSelected}
        onToggle={toggleSelected}
        onHighlightChange={setIsHoveredOrFocused}
      >
        {card}
      </SelectModeCardWrapper>
    );
  }

  return (
    <Link
      {...highlightProps}
      className={S.link}
      to={modelToUrl(item)}
      onClick={handleLinkClick}
    >
      {card}
    </Link>
  );
}
