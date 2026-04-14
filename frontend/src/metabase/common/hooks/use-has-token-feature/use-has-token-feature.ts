import { getTokenFeature } from "metabase/setup/selectors";
import { useSelector } from "metabase/utils/redux";
import type { TokenFeature } from "metabase-types/api";

export const useHasTokenFeature = (settingName: TokenFeature) => {
  return useSelector((state) => getTokenFeature(state, settingName));
};
