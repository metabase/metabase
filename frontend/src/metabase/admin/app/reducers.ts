import { combineReducers, handleActions } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { DISABLE_NOTICE } from "./actions";

const isNoticeEnabled = handleActions(
  {
    [DISABLE_NOTICE]: { next: () => false },
  },
  Settings.deprecationNoticeEnabled(),
);

export default combineReducers({
  isNoticeEnabled,
} as any);
