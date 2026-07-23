import { useRouter } from "metabase/router";
import { isExplorationUrl } from "metabase/urls";
import type { EntityId } from "metabase-types/api/comments";

interface UseCommentUrlOptions {
  childTargetId?: EntityId | null;
}

export function useCommentUrl({ childTargetId }: UseCommentUrlOptions) {
  const { location } = useRouter();
  const { pathname } = location;
  if (!pathname) {
    return "";
  }
  if (isExplorationUrl(pathname)) {
    const search = new URLSearchParams(location.search);
    search.set("comments", "true");
    return `${pathname}?${search.toString()}`;
  }
  const existingCommentIndex = pathname.lastIndexOf("/comments");
  const nextPathname =
    existingCommentIndex !== -1
      ? pathname.slice(0, existingCommentIndex)
      : pathname;
  return `${nextPathname}/comments${childTargetId ? `/${childTargetId}` : ""}${location.search}`;
}
