import React, { useState } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import useStatusVisibility from "../../hooks/use-status-visibility";
import { Database } from "../../types";
import DatabaseStatusLarge from "../DatabaseStatusLarge";
import DatabaseStatusSmall from "../DatabaseStatusSmall";

interface Props {
  databases?: Database[];
}

const DatabaseStatus = ({ databases = [] }: Props) => {
  const isActive = databases.some(isSyncInProgress);
  const isVisible = useStatusVisibility(isActive);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible) {
    return null;
  }

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
