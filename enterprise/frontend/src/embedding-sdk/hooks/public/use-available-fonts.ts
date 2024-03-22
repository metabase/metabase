import { useSelector } from "metabase/lib/redux";
import { getEmbedOptions } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";

export const useAvailableFonts = () => {
  return {
    availableFonts: useSelector(state => getSetting(state, "available-fonts")),
    currentFont: useSelector(getEmbedOptions)?.font,
  };
};
