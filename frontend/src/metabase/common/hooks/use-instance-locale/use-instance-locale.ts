import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";

export const useInstanceLocale = () => {
  return useSelector((state) => getSetting(state, "site-locale"));
};
