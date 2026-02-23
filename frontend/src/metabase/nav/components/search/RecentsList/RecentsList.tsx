import { useListRecentsQuery } from "metabase/api";
import { getName } from "metabase/lib/name";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import { useNavigation } from "metabase/routing";
import { Paper } from "metabase/ui";
import type {
  RecentContexts,
  RecentItem,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

import { getItemUrl, recentsFilter } from "./util";

const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = ["selections", "views"];

type RecentsListProps = {
  onClick?: (elem: UnrestrictedLinkEntity) => void;
  className?: string;
};

export const RecentsList = ({ onClick, className }: RecentsListProps) => {
  const { data = [], isLoading: isRecentsListLoading } = useListRecentsQuery(
    { context: DEFAULT_RECENTS_CONTEXT },
    { refetchOnMountOrArgChange: true },
  );

  const { push } = useNavigation();

  const onChangeLocation = (item: RecentItem) => {
    const url = getItemUrl(item);
    if (url) {
      push(url);
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
