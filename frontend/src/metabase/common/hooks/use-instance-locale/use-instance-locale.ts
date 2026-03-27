import { getSetting } from "metabase/selectors/settings";
import { useSelector } from "metabase/utils/redux";

export const useInstanceLocale = () => {
  return useSelector((state) => getSetting(state, "site-locale"));
};
