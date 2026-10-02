import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

/** Copies a sidebar's own link — `path` made absolute — to the clipboard, reporting it in a toast. */
export function useCopyDetailLink(path: string) {
  const dispatch = useDispatch();

  return useCallback(async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  }, [dispatch, path]);
}
