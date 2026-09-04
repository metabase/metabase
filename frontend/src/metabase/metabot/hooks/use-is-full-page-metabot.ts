import { matchPath, useMaybeLocation } from "metabase/router";
import * as Urls from "metabase/urls";

import { useIsAskPage } from "./use-is-ask-page";

export function useIsFullPageMetabot() {
  const isAskPage = useIsAskPage();
  const location = useMaybeLocation();

  return (
    isAskPage ||
    matchPath(
      `/${Urls.CONVERSATION_BASE_PATH}/:convoId`,
      location?.pathname ?? "",
    ) !== null
  );
}
