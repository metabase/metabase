import { useEffect } from "react";
import { t } from "ttag";

import { api } from "metabase/api/client";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

/** The `error_code` of the 403 the backend preview guard (`permission_debug/preview.clj`) sends for a refused write. */
const READ_ONLY_ERROR_CODE = "permission-preview-read-only";

/** One toast for a burst of refused writes: each refusal replaces it and restarts its timer. */
const TOAST_ID = "permission-preview-read-only";

/**
 * Writes that follow a click but save nothing the admin meant to change, such as recording a recently opened item, so
 * a refusal stays silent.
 */
const BACKGROUND_WRITE_PATHS = ["/api/activity/recents"];

export function isReadOnlyRefusal(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body != null &&
    "error_code" in body &&
    body.error_code === READ_ONLY_ERROR_CODE
  );
}

/** Says "Preview is read-only" when the preview guard refuses a write: the controls stay, and nothing is saved. */
export function ReadOnlyToast() {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleForbidden = (url: string, body?: unknown) => {
      if (isReadOnlyRefusal(body) && !isBackgroundWrite(url)) {
        dispatch(
          addUndo({
            id: TOAST_ID,
            icon: "lock",
            message: t`This preview is read-only, so your change wasn't saved.`,
          }),
        );
      }
    };
    api.on(403, handleForbidden);
    return () => {
      api.off(403, handleForbidden);
    };
  }, [dispatch]);

  return null;
}

function isBackgroundWrite(url: string) {
  const path = url.split("?")[0];
  return BACKGROUND_WRITE_PATHS.includes(path);
}
