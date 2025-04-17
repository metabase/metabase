import type { Action, Location, Query } from "history";
import { useCallback, useMemo } from "react";
import { push, replace } from "react-router-redux";
import { useEffectOnce } from "react-use";
import { match } from "ts-pattern";

import { useDispatch } from "metabase/lib/redux";

export type QueryParam = Query[keyof Query];

type BaseState = Record<string, unknown>;

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: Query) => State;
  serialize: (state: State) => Query;
};

type UrlStateActions<State extends BaseState> = {
  patchUrlState: (
    patch: Partial<State>,
    action?: Extract<Action, "PUSH" | "REPLACE">,
  ) => void;
};

/**
 * Once we migrate to react-router 6 we should be able to replace this custom hook
 * with something more sophisticated, like https://github.com/asmyshlyaev177/state-in-url
 */
export function useUrlState<State extends BaseState>(
  location: Location,
  { parse, serialize }: UrlStateConfig<State>,
): [State, UrlStateActions<State>] {
  const dispatch = useDispatch();
  const state = useMemo(() => parse(location.query), [parse, location.query]);

  const patchUrlState: UrlStateActions<State>["patchUrlState"] = useCallback(
    (patch, action = "PUSH") => {
      const newState = { ...state, ...patch };
      const newLocation = { ...location, query: serialize(newState) };

      match(action)
        .with("PUSH", () => {
          dispatch(push(newLocation));
        })
        .with("REPLACE", () => {
          dispatch(replace(newLocation));
        })
        .exhaustive();
    },
    [dispatch, location, serialize, state],
  );

  useEffectOnce(function cleanInvalidQueryParams() {
    patchUrlState(state, "REPLACE");
  });

  return [state, { patchUrlState }];
}
