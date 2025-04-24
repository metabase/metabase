import type { Location, Query } from "history";
import { useCallback, useEffect, useState } from "react";
import { push, replace } from "react-router-redux";
import { useEffectOnce, useLatest } from "react-use";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { useDispatch } from "metabase/lib/redux";

type BaseState = Record<string, unknown>;

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: Query) => State;
  serialize: (state: State) => Query;
};

type UrlStateActions<State extends BaseState> = {
  patchUrlState: (patch: Partial<State>) => void;
};

export const URL_UPDATE_DEBOUNCE_DELAY = 300;

/**
 * Once we migrate to react-router 6 we should be able to replace this custom hook
 * with something more sophisticated, like https://github.com/asmyshlyaev177/state-in-url
 */
export function useUrlState<State extends BaseState>(
  location: Location,
  { parse, serialize }: UrlStateConfig<State>,
): [State, UrlStateActions<State>] {
  const dispatch = useDispatch();
  const [state, setState] = useState(parse(location.query));
  const urlState = useDebouncedValue(state, URL_UPDATE_DEBOUNCE_DELAY);

  const patchUrlState = useCallback((patch: Partial<State>) => {
    setState((state) => ({ ...state, ...patch }));
  }, []);

  const updateUrl = useCallback(
    (state: State) => {
      const newLocation = { ...location, query: serialize(state) };
      dispatch(push(newLocation));
    },
    [dispatch, location, serialize],
  );

  const updateUrlRef = useLatest(updateUrl);

  useEffectOnce(function cleanInvalidQueryParams() {
    const newLocation = { ...location, query: serialize(urlState) };
    dispatch(replace(newLocation));
  });

  useEffect(() => {
    updateUrlRef.current(urlState);
  }, [updateUrlRef, urlState]);

  return [state, { patchUrlState }];
}
