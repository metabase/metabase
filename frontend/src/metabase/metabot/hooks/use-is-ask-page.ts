import { matchPath, useMaybeLocation } from "metabase/router";
import * as Urls from "metabase/urls";

export function useIsAskPage() {
  // Metabot also renders outside the app router (the SDK, and component tests
  // that mount it bare), where there is no ask page.
  const location = useMaybeLocation();
  const pathname = location?.pathname ?? "";
  return (
    matchPath(Urls.askQuestion(), pathname) !== null ||
    pathname === "/question/new"
  );
}
