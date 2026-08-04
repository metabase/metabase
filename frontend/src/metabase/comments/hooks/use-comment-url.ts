import { useMaybeLocation } from "metabase/router";
import { isExplorationUrl } from "metabase/urls";

interface UseCommentUrlOptions {
  childTargetId?: string | null;
}

export function useCommentUrl({ childTargetId }: UseCommentUrlOptions) {
  const location = useMaybeLocation();
  const pathname = location?.pathname;
  const locationSearch = location?.search ?? "";
  if (!pathname) {
    return "";
  }
  if (isExplorationUrl(pathname)) {
    const search = new URLSearchParams(location.search);
    if (childTargetId) {
      search.set("comments", childTargetId);
    } else {
      search.delete("comments");
    }
    const query = search.toString();
    return query ? `${pathname}?${query}` : pathname;
  }
  const existingCommentIndex = pathname.lastIndexOf("/comments");
  const nextPathname =
    existingCommentIndex !== -1
      ? pathname.slice(0, existingCommentIndex)
      : pathname;
  return `${nextPathname}/comments${childTargetId ? `/${childTargetId}` : ""}${locationSearch}`;
}
