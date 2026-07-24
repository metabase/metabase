import { useCallback, useEffect, useRef, useState } from "react";
import { useEffectOnce, useLatest } from "react-use";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useDispatch } from "metabase/redux";
import type { Location, Query } from "metabase/router";
import { push, replace } from "metabase/router";

type BaseState = Record<string, unknown>;

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: Query) => State;
  serialize: (state: State) => Query;
};

type PatchUrlStateOptions = {
  /**
   * Sync this patch to the URL right away instead of waiting out the debounce
   * — use for direct clicks (pagination, sorting) where the URL should
   * reflect the change immediately, as opposed to rapid-fire changes (e.g.
   * typing into a filter) that should be batched into one URL update.
   */
  immediate?: boolean;
};

type UrlStateActions<State extends BaseState> = {
  patchUrlState: (
    patch: Partial<State>,
    options?: PatchUrlStateOptions,
  ) => void;
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

  const immediateRef = useRef(false);
  const shouldDebounce = useCallback(() => {
    const isImmediate = immediateRef.current;
    immediateRef.current = false;
    return !isImmediate;
  }, []);
  const urlState = useDebouncedValue(
    state,
    URL_UPDATE_DEBOUNCE_DELAY,
    shouldDebounce,
  );

  const patchUrlState = useCallback(
    (
      patch: Partial<State>,
      { immediate = false }: PatchUrlStateOptions = {},
    ) => {
      immediateRef.current = immediate;
      setState((state) => ({ ...state, ...patch }));
    },
    [],
  );

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
