import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import * as Urls from "metabase/urls";

export function useIsAskPage() {
  const { pathname } = useSelector(getLocation);
  return pathname === Urls.newQuestion({ mode: "ask" });
}
