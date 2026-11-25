import { useEffect, useState } from "react";

type Options = {
  initialPath: string | undefined;
  path: string | undefined;
};

/**
 * Returns the path `DataApp` shows. That is `path` when set, otherwise the first `initialPath`.
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

  const [lastShownPath, setLastShownPath] = useState(path ?? initialPath);
  const shownPath = path ?? lastShownPath;

  if (shownPath !== lastShownPath) {
    setLastShownPath(shownPath);
  }

  return shownPath ?? "";
};
