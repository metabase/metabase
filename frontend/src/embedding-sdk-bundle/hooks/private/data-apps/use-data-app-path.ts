import { useEffect, useState } from "react";

type Options = {
  initialPath: string | undefined;
  path: string | undefined;
};

/**
 * The path `DataApp` shows: `path` when set, otherwise the first `initialPath`. Later `initialPath` changes are ignored.
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
  const nextPath = path ?? shownPath;

  if (nextPath !== shownPath) {
    setShownPath(nextPath);
  }

  return nextPath ?? "";
};
