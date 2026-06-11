import { useSelector } from "metabase/redux";
import { getTokenFeature } from "metabase/selectors/settings";
import type { TokenFeature } from "metabase-types/api";

export const useHasTokenFeature = (settingName: TokenFeature) => {
  return useSelector((state) => getTokenFeature(state, settingName));
};
