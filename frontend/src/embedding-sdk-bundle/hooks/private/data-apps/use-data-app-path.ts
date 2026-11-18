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

  const nextPath =
    path ?? (isOtherApp(initialPath, shownPath) ? initialPath : shownPath);

  if (nextPath !== shownPath) {
    setShownPath(nextPath);
  }

  return nextPath ?? "";
};

const isOtherApp = (
  initialPath: string | undefined,
  shownPath: string | undefined,
) => {
  const slug = getSlug(initialPath);

  return slug !== undefined && slug !== getSlug(shownPath);
};

const getSlug = (path: string | undefined) =>
  path === undefined ? undefined : getEmbeddedAppSlugFromPath(path);
