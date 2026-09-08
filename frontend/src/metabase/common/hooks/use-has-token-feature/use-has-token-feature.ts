import type { TokenFeature } from "metabase-types/api";
import { useSelector } from "metabase/redux";
import { getTokenFeature } from "metabase/settings";

export const useHasTokenFeature = (settingName: TokenFeature) => {
  return useSelector((state) => getTokenFeature(state, settingName));
};
