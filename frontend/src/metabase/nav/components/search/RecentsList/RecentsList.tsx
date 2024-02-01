import { useMemo } from "react";
import { push } from "react-router-redux";
import type { RecentItem, UnrestrictedLinkEntity } from "metabase-types/api";
import { useRecentItemListQuery } from "metabase/common/hooks";
import type { IconName } from "metabase/ui";
import RecentItems from "metabase/entities/recent-items";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import {
  getItemName,
  getItemUrl,
} from "metabase/nav/components/search/RecentsList/util";
import { Flex, Paper } from "metabase/ui";
import { isMac } from "metabase/lib/browser";

type RecentsListProps = {
  onClick?: (elem: UnrestrictedLinkEntity) => void;
  className?: string;
};

export interface WrappedRecentItem extends RecentItem {
  getUrl: () => string;
  getIcon: () => {
    name: IconName;
    size?: number;
    width?: number;
    height?: number;
  };
}

const ShortcutKey = ({ children }: { children: React.ReactNode }) => {
  <Flex p=".25rem" bg="gray">
    {children}
  </Flex>;
};

export const RecentsList = ({ onClick, className }: RecentsListProps) => {
  const { data = [], isLoading: isRecentsListLoading } = useRecentItemListQuery(
    { reload: true },
  );

  const wrappedResults: WrappedRecentItem[] = useMemo(
    () => data.map(item => RecentItems.wrapEntity(item)),
    [data],
  );

  const dispatch = useDispatch();

  const onChangeLocation = (item: RecentItem) => {
    const url = getItemUrl(item);
    if (url) {
      dispatch(push(url));
    }
  };

  const onContainerClick = (item: RecentItem) => {
    if (onClick) {
      onClick({
        ...item.model_object,
        model: item.model,
        name: getItemName(item),
        id: item.model_id,
      });
    } else {
      onChangeLocation(item);
    }
  };
  const metaKey = isMac() ? "⌘" : "Ctrl";

  return (
    <Paper withBorder className={className}>
      <RecentsListContent
        isLoading={isRecentsListLoading}
        results={wrappedResults}
        onClick={onContainerClick}
      />
      <Flex p="1rem">
        <ShortcutKey>{metaKey}K</ShortcutKey> Command palette
      </Flex>
    </Paper>
  );
};
