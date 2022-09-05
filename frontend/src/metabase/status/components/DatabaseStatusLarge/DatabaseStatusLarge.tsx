import {
  isSyncAborted,
  isSyncCompleted,
  isSyncInProgress,
} from "metabase/lib/syncing";
import React from "react";
import { t } from "ttag";
import { Database } from "metabase-types/api";
import Icon from "../../../components/Icon";
import {
  StatusCardRoot,
  StatusCardIcon,
  StatusCardBody,
  StatusCardTitle,
  StatusCardDescription,
  StatusCardSpinner,
  StatusCardIconContainer,
  StatusRoot,
  StatusHeader,
  StatusTitle,
  StatusToggle,
  StatusBody,
} from "./DatabaseStatusLarge.styled";
import Ellipsified from "metabase/core/components/Ellipsified";
import useStatusVisibility from "../../hooks/use-status-visibility";

export interface DatabaseStatusLargeProps {
  databases: Database[];
  isActive?: boolean;
  onCollapse?: () => void;
}

const DatabaseStatusLarge = ({
  databases,
  isActive,
  onCollapse,
}: DatabaseStatusLargeProps): JSX.Element => {
  return (
    <StatusRoot role="status">
      <StatusHeader>
        <StatusTitle>{getTitle(databases)}</StatusTitle>
        <StatusToggle onClick={onCollapse}>
          <Icon name="chevrondown" />
        </StatusToggle>
      </StatusHeader>
      <StatusBody>
        {databases.map(database => (
          <StatusCard
            key={database.id}
            database={database}
            isActive={isActive}
          />
        ))}
      </StatusBody>
    </StatusRoot>
  );
};

interface StatusCardProps {
  database: Database;
  isActive?: boolean;
}

const StatusCard = ({
  database,
  isActive,
}: StatusCardProps): JSX.Element | null => {
  const isVisible = useStatusVisibility(isActive || isSyncInProgress(database));

  if (!isVisible) {
    return null;
  }

  return (
    <StatusCardRoot key={database.id}>
      <StatusCardIcon>
        <Icon name="database" />
      </StatusCardIcon>
      <StatusCardBody>
        <StatusCardTitle>
          <Ellipsified>{database.name}</Ellipsified>
        </StatusCardTitle>
        <StatusCardDescription>
          {getDescription(database)}
        </StatusCardDescription>
      </StatusCardBody>
      {isSyncInProgress(database) && (
        <StatusCardSpinner size={24} borderWidth={3} />
      )}
      {isSyncCompleted(database) && (
        <StatusCardIconContainer>
          <Icon name="check" size={12} />
        </StatusCardIconContainer>
      )}
      {isSyncAborted(database) && (
        <StatusCardIconContainer isError={true}>
          <Icon name="warning" size={12} />
        </StatusCardIconContainer>
      )}
    </StatusCardRoot>
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

export default DatabaseStatusLarge;
