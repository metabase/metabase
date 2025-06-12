import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup";

export const useForceLocaleRefresh = () => {
  // this forces the component where it's used to re-render, making `t` use the new locale
  useSelector(getLocale);
};
