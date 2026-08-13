import * as Urls from "metabase/urls";

export function isTransformsJobsRoute(pathname: string) {
  return pathname.startsWith(Urls.transformJobList());
}

export function isTransformsRunsRoute(pathname: string) {
  return pathname.startsWith(Urls.transformGraphRunList());
}

export function isTransformsMainRoute(pathname: string) {
  return (
    pathname.startsWith(Urls.transformList()) &&
    !isTransformsJobsRoute(pathname) &&
    !isTransformsRunsRoute(pathname)
  );
}
