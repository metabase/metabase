import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import SyncSnackbar from "metabase/syncing/components/SyncSnackbar";

const REMOVE_DELAY = 6000;

const propTypes = {
  databases: PropTypes.array,
};

const SyncSnackbarSwitch = ({ databases }) => {
  const syncing = databases.filter(d => !d.is_sample && !d.initial_sync);
  const delayed = useDelayedValue(syncing, REMOVE_DELAY);
  const visible = _.uniq([syncing, delayed], false, d => d.id);

  if (visible.length) {
    return <SyncSnackbar databases={visible} />;
  } else {
    return null;
  }
};

SyncSnackbarSwitch.propTypes = propTypes;

const useDelayedValue = (value, delay) => {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDelayedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return delayedValue;
};

export default SyncSnackbarSwitch;
