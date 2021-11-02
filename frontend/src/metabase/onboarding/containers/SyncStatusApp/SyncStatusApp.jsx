import React, { useEffect, useState } from "react";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncStatus from "../../components/SyncStatus";

const DONE_DELAY = 6000;

const SyncStatusApp = ({ databases }) => {
  const syncingDatabases = databases.filter(d => !d.initial_sync);
  const delayedDatabases = useDelayedValue(syncingDatabases, DONE_DELAY);
  const visibleDatabases = _.union(delayedDatabases, syncingDatabases);

  if (visibleDatabases.length) {
    return <SyncStatus databases={visibleDatabases} />;
  } else {
    return null;
  }
};

const useDelayedValue = (value, delay) => {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDelayedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return delayedValue;
};

export default _.compose(Databases.loadList())(SyncStatusApp);
