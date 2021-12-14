import React, { useState } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import useStatusVisibility from "../../hooks/use-status-visibility";
import DatabaseStatusLarge from "../DatabaseStatusLarge";
import DatabaseStatusSmall from "../DatabaseStatusSmall";
import { Database } from "../../types";

interface Props {
  databases?: Database[];
}

const DatabaseStatus = ({ databases = [] }: Props): JSX.Element | null => {
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

export default DatabaseStatus;
