import { useLocation } from "metabase/router";

interface UseDocumentCommentUrlOptions {
  childTargetId?: string | null;
}

/** Document comments deep-link: `/comments/:childTargetId` path segment. */
export function useDocumentCommentUrl({
  childTargetId,
}: UseDocumentCommentUrlOptions) {
  const { pathname, search } = useLocation();
  if (!pathname) {
    return "";
  }
  const existingCommentIndex = pathname.lastIndexOf("/comments");
  const nextPathname =
    existingCommentIndex !== -1
      ? pathname.slice(0, existingCommentIndex)
      : pathname;
  return `${nextPathname}/comments${childTargetId ? `/${childTargetId}` : ""}${search}`;
}
