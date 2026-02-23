import type { Query } from "history";
import { useCallback, useEffect, useState } from "react";
import { useEffectOnce, useLatest } from "react-use";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useNavigation } from "metabase/routing";

type BaseState = Record<string, unknown>;
type UrlStateLocation = {
  pathname: string;
  search: string;
  hash?: string;
};

export type UrlStateConfig<State extends BaseState> = {
  parse: (query: Query) => State;
  serialize: (state: State) => Query;
};

type UrlStateActions<State extends BaseState> = {
  patchUrlState: (patch: Partial<State>) => void;
};

export const URL_UPDATE_DEBOUNCE_DELAY = 300;

/**
 * Parse URL search string into the legacy Query object shape.
 */
function toQuery(search: string): Query {
  const searchParams = new URLSearchParams(search);
  const query: Query = {};

  searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return query;
}

export function useUrlState<State extends BaseState>(
  location: UrlStateLocation,
  { parse, serialize }: UrlStateConfig<State>,
): [State, UrlStateActions<State>] {
  const { push, replace } = useNavigation();
  const [state, setState] = useState(parse(toQuery(location.search ?? "")));
  const urlState = useDebouncedValue(state, URL_UPDATE_DEBOUNCE_DELAY);

  const patchUrlState = useCallback((patch: Partial<State>) => {
    setState((state) => ({ ...state, ...patch }));
  }, []);

  const updateUrl = useCallback(
    (state: State) => {
      const nextQuery = new URLSearchParams(
        Object.entries(serialize(state)).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (value != null) {
              acc[key] = String(value);
            }
            return acc;
          },
          {},
        ),
      );
      const search = nextQuery.toString();
      const newLocation = {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      };
      push(newLocation);
    },
    [push, location, serialize],
  );

  const updateUrlRef = useLatest(updateUrl);

  useEffectOnce(function cleanInvalidQueryParams() {
    const nextQuery = new URLSearchParams(
      Object.entries(serialize(urlState)).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          if (value != null) {
            acc[key] = String(value);
          }
          return acc;
        },
        {},
      ),
    );
    const search = nextQuery.toString();
    const newLocation = {
      pathname: location.pathname,
      search: search ? `?${search}` : "",
      hash: location.hash,
    };
    replace(newLocation);
  });

  useEffect(() => {
    updateUrlRef.current(urlState);
  }, [updateUrlRef, urlState]);

  return [state, { patchUrlState }];
}
