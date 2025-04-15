import type { Location, Query } from "history";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

export type QueryParam = Query[keyof Query];

type BaseState = Record<string, unknown>;

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: Query) => State;
  serialize: (state: State) => Query;
};

type UrlActions<State extends BaseState> = {
  patchUrlState: (patch: Partial<State>) => void;
};

/**
 * Once we migrate to react-router 6 we should be able to replace this custom hook
 * with something more sophisticated, like https://github.com/asmyshlyaev177/state-in-url
 */
export function useUrlState<State extends BaseState>(
  location: Location,
  { parse, serialize }: UrlStateConfig<State>,
): [State, UrlActions<State>] {
  const dispatch = useDispatch();
  const state = useMemo(() => parse(location.query), [parse, location.query]);

  const patchUrlState = useCallback(
    (patch: Partial<State>) => {
      const state = parse(location.query);
      const newState = { ...state, ...patch };
      const query = serialize(newState);

      dispatch(push({ ...location, query }));
    },
    [dispatch, location, parse, serialize],
  );

  return [state, { patchUrlState }];
}
