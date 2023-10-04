import { useBeforeUnload as useBeforeUnloadHook } from "react-use";
import { t } from "ttag";

// most browsers don't use a custom message with beforeunload anymore, just putting here to retain compatibility
// https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
export const BEFORE_UNLOAD_UNSAVED_MESSAGE = t`You have unsaved changes.`;

const useBeforeUnload = (
  condition: Parameters<typeof useBeforeUnloadHook>[0],
) => {
  return useBeforeUnloadHook(condition, BEFORE_UNLOAD_UNSAVED_MESSAGE);
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useBeforeUnload;
