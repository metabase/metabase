import type { Location } from "history";
import { useEffect } from "react";
import { push } from "react-router-redux";
import { useMount, usePrevious } from "react-use";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";

import { getVisualizerUrlHash } from "../selectors";
import { initializeVisualizer } from "../visualizer.slice";

interface Opts {
  location: Location;
}

export function useVisualizerUrlSync({ location }: Opts) {
  const hash = useSelector(getVisualizerUrlHash);

  const previousHash = usePrevious(hash);
  const previousLocation = usePrevious(location);

  const dispatch = useDispatch();

  useMount(() => {
    if (location.hash) {
      dispatch(initializeVisualizer(location.hash));
    }
  });

  useEffect(() => {
    if (previousLocation && previousLocation.hash !== location.hash) {
      dispatch(initializeVisualizer(location.hash));
    } else if (previousHash && hash !== previousHash) {
      dispatch(push({ ...location, hash: `#${hash}` }));
    }
  }, [dispatch, hash, location, previousHash, previousLocation]);
}
