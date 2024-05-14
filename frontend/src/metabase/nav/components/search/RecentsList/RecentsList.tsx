import { push } from "react-router-redux";

import { useListRecentItemsQuery } from "metabase/api";
import { getName } from "metabase/lib/name";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import { Paper } from "metabase/ui";
import type { RecentItem, UnrestrictedLinkEntity } from "metabase-types/api";

import { getItemUrl, recentsFilter } from "./util";

type RecentsListProps = {
  onClick?: (elem: UnrestrictedLinkEntity) => void;
  className?: string;
};

export const RecentsList = ({ onClick, className }: RecentsListProps) => {
  const { data = [], isLoading: isRecentsListLoading } =
    useListRecentItemsQuery(undefined, { refetchOnMountOrArgChange: true });

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
        ...item,
        description: item.description ?? undefined,
        name: getName(item),
      });
    } else {
      onChangeLocation(item);
    }
  };

  return (
    <Paper withBorder className={className}>
      <RecentsListContent
        isLoading={isRecentsListLoading}
        results={recentsFilter(data)}
        onClick={onContainerClick}
      />
    </Paper>
  );
};
