import { useEffect, useState } from "react";

import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";

type Options = {
  initialPath: string | undefined;
  path: string | undefined;
};

/**
 * The path `DataApp` shows: `path` when set, otherwise the first `initialPath` until it names another valid app.
 * When `path` is removed, the app stays on the last `path`. Warns when both are set.
 */
export const useDataAppPath = ({ initialPath, path }: Options): string => {
  const hasConflictingPaths = initialPath !== undefined && path !== undefined;

  useEffect(() => {
    if (hasConflictingPaths) {
      console.warn(
        "`initialPath` is ignored when `path` is set. Pass only one.",
      );
    }
  }, [hasConflictingPaths]);

  const [shownPath, setShownPath] = useState(path ?? initialPath);
  const [lastInitialPath, setLastInitialPath] = useState(initialPath);

  if (initialPath !== lastInitialPath) {
    setLastInitialPath(initialPath);
  }

  // `initialPath` is only the first page, so a new route or query in it must not move the user away from where
  // they navigated. A new app slug is different: the host is asking for another app, which needs a new iframe
  // anyway. An invalid slug is ignored so a bad later value does not replace a working app with an error.
  // Only a change to `initialPath` counts, so removing `path` does not jump to an `initialPath` of another app.
  const shouldOpenInitialPath =
    initialPath !== lastInitialPath &&
    hasAppSlugChanged(initialPath, shownPath);

  const nextPath = path ?? (shouldOpenInitialPath ? initialPath : shownPath);

  if (nextPath !== shownPath) {
    setShownPath(nextPath);
  }

  return nextPath ?? "";
};

const hasAppSlugChanged = (
  initialPath: string | undefined,
  shownPath: string | undefined,
) => {
  const slug = getSlug(initialPath);

  return slug !== undefined && slug !== getSlug(shownPath);
};

const getSlug = (path: string | undefined) =>
  path === undefined ? undefined : getEmbeddedAppSlugFromPath(path);
