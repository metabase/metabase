import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const useInstanceLocale = () => {
  return useSelector((state) => getSetting(state, "site-locale"));
};
