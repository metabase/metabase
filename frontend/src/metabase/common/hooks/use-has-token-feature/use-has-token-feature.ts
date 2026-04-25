import { useSelector } from "metabase/redux";
import { getTokenFeature } from "metabase/setup/selectors";
import type { TokenFeature } from "metabase-types/api";

export const useHasTokenFeature = (settingName: TokenFeature) => {
  return useSelector((state) => getTokenFeature(state, settingName));
};
