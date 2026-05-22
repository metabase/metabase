import type { IconName } from "metabase-types/api";

export function iconForPath(pathname: string): IconName {
  if (pathname.startsWith("/admin")) {
    return "gear";
  }
  if (pathname.startsWith("/metabot")) {
    return "metabot";
  }
  if (pathname.startsWith("/dashboard")) {
    return "dashboard";
  }
  if (pathname.startsWith("/model")) {
    return "model";
  }
  if (pathname.startsWith("/question")) {
    return "table";
  }
  if (pathname.startsWith("/collection")) {
    return "folder";
  }
  if (pathname.startsWith("/browse")) {
    return "database";
  }
  return "document";
}
