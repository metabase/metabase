import { t } from "ttag";

import {
  isSyncAborted,
  isSyncCompleted,
  isSyncInProgress,
} from "metabase/utils/syncing";
import type { Database } from "metabase-types/api";

import StatusLarge from "../StatusLarge";

export type DatabaseStatusLargeProps = {
  databases: Database[];
  isActive?: boolean;
  onCollapse?: () => void;
};

export const DatabaseStatusLarge = ({
  databases,
  onCollapse,
  isActive,
}: DatabaseStatusLargeProps) => {
  const status = {
    title: getTitle(databases),
    items: databases.map((database) => ({
      id: database.id,
      title: database.name,
      icon: "database",
      description: getDescription(database),
      isInProgress: isSyncInProgress(database),
      isCompleted: isSyncCompleted(database),
      isAborted: isSyncAborted(database),
    })),
  };

  return (
    <StatusLarge status={status} onCollapse={onCollapse} isActive={isActive} />
  );
};

const getTitle = (databases: Database[]): string => {
  const isDone = databases.every(isSyncCompleted);
  const isError = databases.some(isSyncAborted);

  if (isError) {
    return t`Error syncing`;
  } else if (isDone) {
    return t`Done!`;
  } else {
    return t`Syncing…`;
  }
};

const getDescription = (database: Database): string => {
  const isDone = isSyncCompleted(database);
  const isError = isSyncAborted(database);

  if (isError) {
    return t`Sync failed`;
  } else if (isDone) {
    return t`Syncing completed`;
  } else {
    return t`Syncing tables…`;
  }
};
