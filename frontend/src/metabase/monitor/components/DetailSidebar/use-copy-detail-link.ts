import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

export function useCopyDetailLink(path: string) {
  const dispatch = useDispatch();

  return useCallback(async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  }, [dispatch, path]);
}
