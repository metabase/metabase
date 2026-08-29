import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { getCurrentDocument } from "metabase/documents/selectors";
import { useSelector } from "metabase/redux";

export function useUnresolvedDocumentCommentsCount(
  childTargetId: string,
  { skip = false }: { skip?: boolean } = {},
) {
  const document = useSelector(getCurrentDocument);
  const { unresolvedCommentsCount } = useUnresolvedCommentsCount({
    target:
      document != null
        ? {
            target_id: document.id,
            target_type: "document",
          }
        : undefined,
    childTargetId,
    skip,
  });
  return unresolvedCommentsCount;
}
