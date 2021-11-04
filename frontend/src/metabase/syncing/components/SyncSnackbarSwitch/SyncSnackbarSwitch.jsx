import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import SyncSnackbar from "metabase/syncing/components/SyncSnackbar";

const REMOVE_DELAY = 6000;

const propTypes = {
  databases: PropTypes.array,
};

const SyncSnackbarSwitch = ({ databases }) => {
  const visibleDatabases = useVisibleDatabases(databases);

  if (visibleDatabases.length) {
    return <SyncSnackbar databases={visibleDatabases} />;
  } else {
    return null;
  }
};

SyncSnackbarSwitch.propTypes = propTypes;

const useVisibleDatabases = databases => {
  const syncingIds = databases.filter(d => !d.initial_sync).map(d => d.id);
  const delayedIds = useDelayedValue(syncingIds, REMOVE_DELAY);
  const visibleIds = _.uniq([...syncingIds, ...delayedIds]);
  const databaseById = Object.fromEntries(databases.map(d => [d.id, d]));

  return visibleIds.map(id => databaseById[id]);
};

const useDelayedValue = (value, delay) => {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDelayedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return delayedValue;
};

export default SyncSnackbarSwitch;
