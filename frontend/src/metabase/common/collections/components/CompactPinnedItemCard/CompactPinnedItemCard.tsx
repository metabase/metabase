import { t } from "ttag";

import { ActionMenu } from "metabase/common/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/common/collections/types";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { EventSandbox } from "metabase/common/components/EventSandbox";
import { Link } from "metabase/common/components/Link";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Card, Ellipsified, Group } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  CollectionItemModel,
  RecentCollectionItem,
} from "metabase-types/api";

import S from "./CompactPinnedItemCard.module.css";

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

  return (
    <Link className={S.link} to={modelToUrl(item)} onClick={onClick}>
      <Card className={S.card} h="5rem" p={0} pos="relative" withBorder>
        <div className={S.body}>
          <EntityIcon
            {...icon}
            className={S.icon}
            size="1.25rem"
            color="core-brand"
          />
          <div className={S.content}>
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
          </div>
        </div>
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
              />
            </EventSandbox>
          </Box>
        )}
      </Card>
    </Link>
  );
}
