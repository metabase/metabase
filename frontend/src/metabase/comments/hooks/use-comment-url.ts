import { useRouter } from "metabase/router";
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
  const existingCommentIndex = pathname.lastIndexOf("/comments");
  const nextPathname =
    existingCommentIndex !== -1
      ? pathname.slice(0, existingCommentIndex)
      : pathname;
  return `${nextPathname}/comments${childTargetId ? `/${childTargetId}` : ""}${location.search}`;
}
