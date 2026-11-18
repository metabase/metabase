import { useEffect, useState } from "react";

import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";

type Options = {
  initialPath: string | undefined;
  path: string | undefined;
};

/**
 * The path `DataApp` shows: `path` when set, otherwise the first `initialPath` until its app slug changes.
 * Warns when both are set.
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

  const [uncontrolledPath, setUncontrolledPath] = useState(initialPath);

  if (getSlug(initialPath) !== getSlug(uncontrolledPath)) {
    setUncontrolledPath(initialPath);
  }

  return path ?? uncontrolledPath ?? "";
};

const getSlug = (path: string | undefined) =>
  path === undefined ? undefined : getEmbeddedAppSlugFromPath(path);
