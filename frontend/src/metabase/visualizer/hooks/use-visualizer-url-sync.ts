import type { Location } from "history";
import { useEffect } from "react";
import type { InjectedRouter } from "react-router";
import { push } from "react-router-redux";
import { usePrevious } from "react-use";

import { b64hash_to_utf8 } from "metabase/lib/encoding";
import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getFutureVisualizerUrlHashes,
  getPastVisualizerUrlHashes,
  getVisualizerUrlHash,
} from "../selectors";
import {
  initializeVisualizer,
  redo,
  resetVisualizer,
  undo,
} from "../visualizer.slice";

export function useVisualizerUrlSync(
  location: Location,
  router: InjectedRouter,
) {
  const stateHash = useSelector(getVisualizerUrlHash);
  const pastStateHashes = useSelector(getPastVisualizerUrlHashes);
  const futureStateHashes = useSelector(getFutureVisualizerUrlHashes);

  const previousStateHash = usePrevious(stateHash);
  const previousLocation = usePrevious(location);

  const dispatch = useDispatch();

  useEffect(() => {
    // @ts-expect-error missing type declaration
    const unsubscribe = router.listen(nextLocation => {
      const nextHash = cleanHash(nextLocation?.hash);
      const didGoBack = pastStateHashes.includes(nextHash);
      const didGoForward = futureStateHashes.includes(nextHash);
      if (didGoBack) {
        dispatch(undo());
      } else if (didGoForward) {
        dispatch(redo());
      }
    });

    return () => unsubscribe();
  }, [pastStateHashes, futureStateHashes, router, dispatch]);

  useEffect(() => {
    const hash = cleanHash(location?.hash);
    const previousHash = cleanHash(previousLocation?.hash);

    const isUrlHashChanged =
      hash && hash !== previousHash && hash !== stateHash;
    const isUrlHashRemoved = previousHash && !hash;
    const isStateChanged =
      stateHash && stateHash !== hash && stateHash !== previousStateHash;

    if (isStateChanged) {
      dispatch(push({ ...location, hash: `#${stateHash}` }));
    } else if (isUrlHashChanged) {
      try {
        const visualizerState = JSON.parse(b64hash_to_utf8(hash));
        dispatch(initializeVisualizer(visualizerState));
      } catch (err) {
        console.error("Error parsing visualizer URL hash", err);
      }
    } else if (isUrlHashRemoved) {
      dispatch(resetVisualizer());
    }
  }, [
    stateHash,
    previousStateHash,
    pastStateHashes,
    futureStateHashes,
    location,
    previousLocation,
    dispatch,
  ]);
}

function cleanHash(hash?: string) {
  return hash?.startsWith("#") ? hash.slice(1) : hash;
}
