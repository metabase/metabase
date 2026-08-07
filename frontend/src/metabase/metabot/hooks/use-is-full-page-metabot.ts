import { useMaybeLocation } from "metabase/router";
import * as Urls from "metabase/urls";

import { useIsAskPage } from "./use-is-ask-page";

export function useIsFullPageMetabot() {
  const isAskPage = useIsAskPage();
  const location = useMaybeLocation();

  return isAskPage || Urls.isMetabotConversationUrl(location?.pathname ?? "");
}
