import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import type { Settings } from "metabase-types/api";

export const useSetting = (settingName: keyof Settings) => {
  return useSelector(state => getSetting(state, settingName));
};
