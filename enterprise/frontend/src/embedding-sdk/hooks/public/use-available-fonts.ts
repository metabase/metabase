import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const useAvailableFonts = () => {
  return {
    availableFonts: useSelector(state => getSetting(state, "available-fonts")),
  };
};
