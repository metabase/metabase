import { useCallback, useEffect, useRef, useState } from "react";
import { useEffectOnce, useLatest } from "react-use";
import _ from "underscore";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { Location } from "metabase/router";
import { queryToSearch, useNavigate } from "metabase/router";
import { parseSearchQuery } from "metabase/utils/browser";

import type { UrlStateQuery } from "./types";

type BaseState = Record<string, unknown>;

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: UrlStateQuery) => State;
  serialize: (state: State) => UrlStateQuery;
};

type PatchUrlStateOptions = {
  /**
   * Sync this patch to the URL right away instead of waiting out the debounce.
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
  const navigate = useNavigate();
  const [state, setState] = useState(() =>
    parse(parseSearchQuery(location.search)),
  );

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
      const search = queryToSearch(serialize(state));
      // skip when the URL already carries this state, so adopting a URL below
      // does not push it onto the history a second time
      if (search !== location.search) {
        navigate({ ...location, search });
      }
    },
    [location, serialize, navigate],
  );

  const updateUrlRef = useLatest(updateUrl);
  const urlStateRef = useLatest(urlState);

  useEffectOnce(function cleanInvalidQueryParams() {
    const search = queryToSearch(serialize(urlState));
    // Replacing to the identical URL notifies the router, which re-renders every
    // location consumer on the page for nothing.
    if (search !== location.search) {
      navigate(
        { ...location, search },
        { replace: true, state: location.state },
      );
    }
  });

  useEffect(() => {
    const nextState = parse(parseSearchQuery(location.search));
    // compare against the last state written to the URL rather than `state`, so
    // a patch still waiting out the debounce is not reverted.
    if (!_.isEqual(serialize(nextState), serialize(urlStateRef.current))) {
      patchUrlState(nextState, { immediate: true });
    }
  }, [location.search, parse, serialize, urlStateRef, patchUrlState]);

  useEffect(() => {
    updateUrlRef.current(urlState);
  }, [updateUrlRef, urlState]);

  return [state, { patchUrlState }];
}
