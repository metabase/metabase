import React, { useState, useCallback } from "react";
import { t } from "ttag";
import {
  isSyncAborted,
  isSyncCompleted,
  isSyncInProgress,
} from "metabase/lib/syncing";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import {
  SnackbarRoot,
  SnackbarTitle,
  SnackbarHeader,
  SnackbarToggle,
  SnackbarContent,
  DatabaseCard,
  DatabaseIcon,
  DatabaseContent,
  DatabaseTitle,
  DatabaseDescription,
  DatabaseIconContainer,
  DatabaseSpinner,
} from "./SyncSnackbarContent.styled";
import { Database } from "../../types";

export interface Props {
  databases: Database[];
}

const SyncSnackbarContent = ({ databases }: Props) => {
  const [isOpened, setIsOpened] = useState(true);
  const handleToggle = useCallback(() => setIsOpened(state => !state), []);

  return (
    <SnackbarRoot aria-role="status">
      <SnackbarHeader>
        <SnackbarTitle>{getTitleMessage(databases, isOpened)}</SnackbarTitle>
        <SnackbarToggle onClick={handleToggle}>
          {isOpened ? <Icon name="chevrondown" /> : <Icon name="chevronup" />}
        </SnackbarToggle>
      </SnackbarHeader>
      {isOpened && (
        <SnackbarContent>
          {databases.map(database => (
            <DatabaseCard key={database.id}>
              <DatabaseIcon>
                <Icon name="database" />
              </DatabaseIcon>
              <DatabaseContent>
                <DatabaseTitle>
                  <Ellipsified>{database.name}</Ellipsified>
                </DatabaseTitle>
                <DatabaseDescription>
                  {getDescriptionMessage(database)}
                </DatabaseDescription>
              </DatabaseContent>
              {isSyncInProgress(database) && (
                <DatabaseSpinner size={24} borderWidth={3} />
              )}
              {isSyncCompleted(database) && (
                <DatabaseIconContainer>
                  <Icon name="check" size={12} />
                </DatabaseIconContainer>
              )}
              {isSyncAborted(database) && (
                <DatabaseIconContainer isError={true}>
                  <Icon name="warning" size={12} />
                </DatabaseIconContainer>
              )}
            </DatabaseCard>
          ))}
        </SnackbarContent>
      )}
    </SnackbarRoot>
  );
};

const getTitleMessage = (databases: Database[], isOpened: boolean) => {
  const isDone = databases.every(d => isSyncCompleted(d));
  const isError = databases.some(d => isSyncAborted(d));

  const tables = databases.flatMap(d => d.tables);
  const totalCount = tables.length;
  const doneCount = tables.filter(t => isSyncCompleted(t)).length;
  const donePercentage = Math.floor((doneCount / totalCount) * 100);

  if (isError) {
    return t`Error syncing`;
  } else if (isDone) {
    return t`Done!`;
  } else if (!isOpened && totalCount) {
    return t`Syncing… (${donePercentage}%)`;
  } else {
    return t`Syncing…`;
  }
};

const getDescriptionMessage = (database: Database) => {
  const isDone = isSyncCompleted(database);
  const isError = isSyncAborted(database);
  const doneCount = database.tables.filter(t => isSyncCompleted(t)).length;
  const totalCount = database.tables.length;

  if (isError) {
    return t`Sync failed`;
  } else if (totalCount) {
    return t`${doneCount} of ${totalCount} done`;
  } else if (!isDone) {
    return t`Syncing tables…`;
  }
};

export default SyncSnackbarContent;
