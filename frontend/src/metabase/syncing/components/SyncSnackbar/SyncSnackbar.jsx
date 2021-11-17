import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { isSyncInProgress } from "metabase/lib/syncing";
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
  const syncingIds = databases.filter(d => isSyncInProgress(d)).map(d => d.id);
  const visibleIds = useListWithRemoveDelay(syncingIds, REMOVE_DELAY);
  const databaseById = Object.fromEntries(databases.map(d => [d.id, d]));

  return visibleIds.map(id => databaseById[id]).filter(d => d != null);
};

const useListWithRemoveDelay = (list, delay) => {
  const { current: map } = useRef(new Map());
  const [_, rerender] = useState();

  list.forEach(item => {
    map.set(item, null);
  });

  map.forEach((timeout, item) => {
    if (!list.includes(item) && !timeout) {
      const handler = () => {
        map.delete(item);
        rerender({});
      };

      map.set(item, setTimeout(handler, delay));
    }
  });

  useEffect(() => {
    return () => map.forEach(timeout => clearTimeout(timeout));
  }, [map]);

  return Array.from(map.keys());
};

export default SyncSnackbar;
