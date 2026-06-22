import { getCurrentDocument } from "metabase/documents/selectors";
import { getCurrentExploration } from "metabase/explorations/selectors";
import { useSelector } from "metabase/redux";
import type { CommentTarget } from "metabase-types/api";

export function useCommentTarget(): CommentTarget | null {
  const document = useSelector(getCurrentDocument);
  const exploration = useSelector(getCurrentExploration);

  if (document) {
    return {
      target_id: document.id,
      target_type: "document",
    };
  }

  if (exploration) {
    return {
      target_id: exploration.id,
      target_type: "exploration",
    };
  }

  return null;
}
