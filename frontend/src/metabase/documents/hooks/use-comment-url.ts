import { useRouter } from "metabase/router";
import type { EntityId } from "metabase-types/api/comments";

interface UseCommentUrlOptions {
  childTargetId: EntityId | null;
  searchParams?: Record<string, string>;
}

export function useCommentUrl({
  childTargetId,
  searchParams,
}: UseCommentUrlOptions) {
  const { location } = useRouter();
  const { pathname, query } = location;
  if (!pathname) {
    return "";
  }
  const existingCommentIndex = pathname.lastIndexOf("/comments/");
  const nextPathname =
    existingCommentIndex !== -1
      ? pathname.slice(0, existingCommentIndex)
      : pathname;
  const nextSearch = new URLSearchParams({
    ...query,
    ...searchParams,
  }).toString();
  return `${nextPathname}/comments/${childTargetId}${nextSearch ? `?${nextSearch}` : ""}`;
}
