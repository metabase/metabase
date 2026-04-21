import { useEffect, useState } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { getUser } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";
import { isSyncInProgress } from "metabase/utils/syncing";
import type { Database, User } from "metabase-types/api";

import useStatusVisibility from "../../hooks/use-status-visibility";
import { DatabaseStatusLarge } from "../DatabaseStatusLarge";
import { DatabaseStatusSmall } from "../DatabaseStatusSmall";

const POLLING_INTERVAL = 2000;

export const DatabaseStatus = () => {
  const [isPolling, setIsPolling] = useState(false);
  const { data } = useListDatabasesQuery(
    {},
    {
      pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
    },
  );
  const user = useSelector(getUser);
  const databases = getDatabases(data?.data ?? [], user);
  const isSyncing = databases.some(isSyncInProgress);
  const isVisible = useStatusVisibility(isSyncing);

  useEffect(() => {
    setIsPolling(isSyncing);
  }, [isSyncing]);

  useEffect(() => {
    if (isVisible) {
      document.body.classList.add("sync-status-visible");
    } else {
      document.body.classList.remove("sync-status-visible");
    }
  }, [isVisible]);

  if (isVisible) {
    return <DatabaseStatusContent databases={databases} />;
  } else {
    return null;
  }
};

type DatabaseStatusContentProps = {
  databases: Database[];
};

const DatabaseStatusContent = ({
  databases = [],
}: DatabaseStatusContentProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true);

  return isExpanded ? (
    <DatabaseStatusLarge
      databases={databases}
      onCollapse={() => setIsExpanded(false)}
    />
  ) : (
    <DatabaseStatusSmall
      databases={databases}
      onExpand={() => setIsExpanded(true)}
    />
  );
};

const getDatabases = (databases: Database[], user: User | null): Database[] => {
  return databases.filter((d) => !d.is_sample && d.creator_id === user?.id);
};
