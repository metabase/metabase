import { useLocation } from "react-use";

import type { EntityId } from "metabase-types/api/comments";

interface UseCommentUrlOptions {
  childTargetId: EntityId | null;
}

export function useCommentUrl({ childTargetId }: UseCommentUrlOptions) {
  const { pathname } = useLocation();
  if (!pathname) {
    return "";
  }
  const existingCommentIndex = pathname.lastIndexOf("/comments/");
  if (existingCommentIndex !== -1) {
    return `${pathname.slice(0, existingCommentIndex)}/comments/${childTargetId}`;
  }
  return `${pathname}/comments/${childTargetId}`;
}
