import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { isSyncCompleted } from "metabase/lib/syncing";
import SyncSnackbarContent from "../SyncSnackbarContent";

const REMOVE_DELAY = 6000;

const propTypes = {
  databases: PropTypes.array,
};

const SyncSnackbar = ({ databases }) => {
  const visibleDatabases = useVisibleDatabases(databases);

  if (visibleDatabases.length) {
    return <SyncSnackbarContent databases={visibleDatabases} />;
  } else {
    return null;
  }
};

SyncSnackbar.propTypes = propTypes;

const useVisibleDatabases = databases => {
  const syncingIds = databases.filter(d => !isSyncCompleted(d)).map(d => d.id);
  const delayedIds = useDelayedValue(syncingIds, REMOVE_DELAY);
  const visibleIds = _.uniq([...syncingIds, ...delayedIds]);
  const databaseById = Object.fromEntries(databases.map(d => [d.id, d]));

  return visibleIds.map(id => databaseById[id]).filter(d => d != null);
};

const useDelayedValue = (value, delay) => {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDelayedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return delayedValue;
};

export default SyncSnackbar;
