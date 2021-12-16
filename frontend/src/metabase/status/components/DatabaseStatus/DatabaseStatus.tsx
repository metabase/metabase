import React, { useState } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import useStatusVisibility from "../../hooks/use-status-visibility";
import DatabaseStatusLarge from "../DatabaseStatusLarge";
import DatabaseStatusSmall from "../DatabaseStatusSmall";
import { Database, User } from "../../types";

interface Props {
  user?: User;
  databases?: Database[];
}

const DatabaseStatus = (props: Props): JSX.Element | null => {
  const databases = getDatabases(props);
  const isActive = databases.some(isSyncInProgress);
  const isVisible = useStatusVisibility(isActive);

  if (isVisible) {
    return <DatabaseStatusContent databases={databases} />;
  } else {
    return null;
  }
};

const DatabaseStatusContent = ({ databases = [] }: Props): JSX.Element => {
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

const getDatabases = ({ user, databases = [] }: Props): Database[] => {
  return databases.filter(d => !d.is_sample && d.creator_id === user?.id);
};

export default DatabaseStatus;
