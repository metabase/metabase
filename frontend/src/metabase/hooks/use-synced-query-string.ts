import { useEffect } from "react";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { buildSearchString } from "metabase/lib/urls";

export function useSyncedQueryString(
  fn: () => Record<string, any>,
  deps?: any[],
) {
  useEffect(() => {
    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     */
    if (IS_EMBED_PREVIEW) {
      return;
    }
    const object = fn();
    const searchString = buildSearchString({
      object,
      filterFn: containsAllowedParams,
    });

    if (searchString !== window.location.search) {
      history.replaceState(
        null,
        document.title,
        window.location.pathname + searchString + window.location.hash,
      );
    }

    return () => {
      // Remove every previously-synced keys from the query string when the component is unmounted.
      // This is a workaround to clear the parameter list state when [SyncedParametersList] unmounts.
      const searchString = buildSearchString({
        filterFn: key => !(key in object),
      });

      if (searchString !== window.location.search) {
        history.replaceState(
          null,
          document.title,
          window.location.pathname + searchString + window.location.hash,
        );
      }
    };

    // exhaustive-deps is enabled for useSyncedQueryString so we don't need to include `fn` as a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "tab"];

const containsAllowedParams = (objectKey: string) => {
  return QUERY_PARAMS_ALLOW_LIST.includes(objectKey);
};
