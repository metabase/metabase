import { useMaybeLocation } from "metabase/router";

interface UseDocumentCommentUrlOptions {
  childTargetId?: string | null;
}

/** Document comments deep-link: `/comments/:childTargetId` path segment. */
export function useDocumentCommentUrl({
  childTargetId,
}: UseDocumentCommentUrlOptions) {
  const location = useMaybeLocation();
  const pathname = location?.pathname;
  const search = location?.search ?? "";
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
