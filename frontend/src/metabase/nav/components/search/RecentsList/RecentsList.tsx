import { useMemo } from "react";
import { push } from "react-router-redux";

import { useRecentItemListQuery } from "metabase/common/hooks";
import RecentItems from "metabase/entities/recent-items";
import { isMac } from "metabase/lib/browser";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import {
  getItemName,
  getItemUrl,
} from "metabase/nav/components/search/RecentsList/util";
import { Flex, Paper, Text, type IconName } from "metabase/ui";
import type { RecentItem, UnrestrictedLinkEntity } from "metabase-types/api";

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
      <Flex
        px="1rem"
        py=".5rem"
        gap=".5rem"
        align="center"
        bg="#f9fbfc"
        style={{
          borderBottomLeftRadius: ".5rem",
          borderBottomRightRadius: ".5rem",
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Text
          p="0.25rem"
          bg={color("bg-light")}
          fw={700}
          fz="8pt"
          lh="8pt"
          style={{
            borderRadius: "0.25rem",
            border: `1px solid ${color("border")}`,
          }}
        >{`${metaKey} + K `}</Text>
        <Text size="sm" c={color("text-light")} fw={700} tt="uppercase">
          Open command palette
        </Text>
      </Flex>
    </Paper>
  );
};
