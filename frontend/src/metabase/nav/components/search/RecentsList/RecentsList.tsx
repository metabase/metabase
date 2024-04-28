import { push } from "react-router-redux";

import { useListRecentItemsQuery } from "metabase/api";
import { getName } from "metabase/lib/name";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import { getItemUrl } from "metabase/nav/components/search/RecentsList/util";
import { Paper } from "metabase/ui";
import type { RecentItem, UnrestrictedLinkEntity } from "metabase-types/api";

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
        ...item.model_object,
        model: item.model,
        name: getName(item.model_object),
        id: item.model_id,
      });
    } else {
      onChangeLocation(item);
    }
  };

  return (
    <Paper withBorder className={className}>
      <RecentsListContent
        isLoading={isRecentsListLoading}
        results={data}
        onClick={onContainerClick}
      />
    </Paper>
  );
};
