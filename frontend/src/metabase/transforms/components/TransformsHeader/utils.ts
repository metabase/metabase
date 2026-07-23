import * as Urls from "metabase/urls";

export function isTransformsMainRoute(pathname: string) {
  if (!pathname.startsWith(Urls.transformList())) {
    return false;
  }

  if (pathname.startsWith(Urls.transformJobList())) {
    return false;
  }

  if (pathname.startsWith(Urls.transformRunList())) {
    return false;
  }

  return true;
}
