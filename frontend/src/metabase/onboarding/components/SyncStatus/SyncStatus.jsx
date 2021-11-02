import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import {
  DatabaseCard,
  DatabaseContent,
  DatabaseDescription,
  DatabaseIcon,
  DatabaseIconContainer,
  DatabaseSpinner,
  DatabaseTitle,
  Popup,
  PopupContent,
  PopupHeader,
  PopupTitle,
  PopupToggle,
} from "./SyncStatus.styled";

const DONE_DELAY = 6000;

const propTypes = {
  databases: PropTypes.array,
};

const SyncStatus = ({ databases }) => {
  const [isOpened, setIsOpened] = useState(true);
  const handleToggle = useCallback(() => setIsOpened(state => !state), []);

  const syncingDatabases = getSyncingDatabases(databases);
  const delayedDatabases = useDelayedValue(syncingDatabases, DONE_DELAY);
  const visibleDatabases = _.union(delayedDatabases, syncingDatabases);

  return (
    <Popup>
      <PopupHeader>
        <PopupTitle>{getTitleMessage(syncingDatabases, isOpened)}</PopupTitle>
        <PopupToggle onClick={handleToggle}>
          {isOpened ? <Icon name="chevrondown" /> : <Icon name="chevronup" />}
        </PopupToggle>
      </PopupHeader>
      {isOpened && (
        <PopupContent>
          {visibleDatabases.map(database => (
            <DatabaseCard key={database.id}>
              <DatabaseIcon>
                <Icon name="database" />
              </DatabaseIcon>
              <DatabaseContent>
                <DatabaseTitle>
                  <Ellipsified>
                    {database.display_name || database.name}
                  </Ellipsified>
                </DatabaseTitle>
                <DatabaseDescription>
                  {getDescriptionMessage(database)}
                </DatabaseDescription>
              </DatabaseContent>
              {database.initial_sync ? (
                <DatabaseIconContainer>
                  <Icon name="check" size={12} />
                </DatabaseIconContainer>
              ) : (
                <DatabaseSpinner size={24} borderWidth={3} />
              )}
            </DatabaseCard>
          ))}
        </PopupContent>
      )}
    </Popup>
  );
};

SyncStatus.propTypes = propTypes;

const getTitleMessage = (syncingDatabases, isOpened) => {
  const tables = syncingDatabases.flatMap(d => d.tables);
  const doneCount = tables.filter(t => t.initial_sync).length;
  const totalCount = tables.length;
  const donePercentage = Math.floor((doneCount / totalCount) * 100);

  return syncingDatabases.length === 0
    ? t`Done!`
    : isOpened && totalCount > 0
    ? t`Syncing... (${donePercentage}%`
    : t`Syncing...`;
};

const getDescriptionMessage = database => {
  const doneCount = database.tables.filter(t => t.initial_sync).length;
  const totalCount = database.tables.length;

  return t`${doneCount} of ${totalCount} done`;
};

const getSyncingDatabases = databases => {
  return databases.filter(d => !d.initial_sync);
};

const useDelayedValue = (value, delay) => {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDelayedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return delayedValue;
};

export default SyncStatus;
